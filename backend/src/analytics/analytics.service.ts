import { getDb } from '../db'
import { sql } from 'kysely'
import { listMessages, batchGetMessages } from '../gmail/gmail.service'
import { getRedis } from '../plugins/redis'

const ANALYTICS_CACHE_TTL = 60 * 15 // 15 minutes

// ─── Cache helpers ──────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  const cached = await redis.get(key)
  return cached ? JSON.parse(cached) : null
}

async function setCache(key: string, data: unknown, ttl = ANALYTICS_CACHE_TTL): Promise<void> {
  const redis = getRedis()
  await redis.set(key, JSON.stringify(data), 'EX', ttl)
}

// ─── Heatmap d'activité email ───────────────────────────

export interface HeatmapCell {
  day: number   // 0=lundi … 6=dimanche
  hour: number  // 0-23
  count: number
}

export async function computeHeatmap(accountId: string): Promise<HeatmapCell[]> {
  // Récupère les mails récents pour construire le heatmap
  const listRes = await listMessages(accountId, { maxResults: 500 })
  if (!listRes.messages.length) return []

  const messageIds = listRes.messages.map((m: any) => m.id)
  const messages = await batchGetMessages(accountId, messageIds)

  const grid = new Map<string, number>()

  for (const msg of messages) {
    const d = new Date(msg.date)
    if (Number.isNaN(d.getTime())) continue

    // getDay() : 0=dimanche, on convertit en 0=lundi
    const jsDay = d.getDay()
    const day = jsDay === 0 ? 6 : jsDay - 1
    const hour = d.getHours()
    const key = `${day}-${hour}`
    grid.set(key, (grid.get(key) ?? 0) + 1)
  }

  const db = getDb()

  // Upsert les données dans la table
  for (const [key, count] of grid) {
    const [day, hour] = key.split('-').map(Number)
    await db
      .insertInto('email_activity_heatmap')
      .values({
        gmail_account_id: accountId,
        day_of_week: day,
        hour_of_day: hour,
        email_count: count,
      })
      .onConflict((oc) =>
        oc.columns(['gmail_account_id', 'day_of_week', 'hour_of_day']).doUpdateSet({
          email_count: count,
          computed_at: sql`NOW()`,
        })
      )
      .execute()
  }

  return [...grid.entries()].map(([key, count]) => {
    const [day, hour] = key.split('-').map(Number)
    return { day, hour, count }
  })
}

export async function getHeatmap(accountId: string, refresh = false): Promise<HeatmapCell[]> {
  const cacheKey = `analytics:heatmap:${accountId}`
  if (!refresh) {
    const cached = await getCached<HeatmapCell[]>(cacheKey)
    if (cached) return cached
  }

  // Essaie les données DB d'abord
  const db = getDb()
  const rows = await db
    .selectFrom('email_activity_heatmap')
    .select(['day_of_week', 'hour_of_day', 'email_count'])
    .where('gmail_account_id', '=', accountId)
    .execute()

  if (rows.length > 0 && !refresh) {
    const result = rows.map((r) => ({
      day: r.day_of_week,
      hour: r.hour_of_day,
      count: Number(r.email_count),
    }))
    await setCache(cacheKey, result)
    return result
  }

  // Recalcule
  const result = await computeHeatmap(accountId)
  await setCache(cacheKey, result)
  return result
}

// ─── Score d'encombrement par expéditeur ────────────────

export interface SenderScoreResult {
  sender: string
  emailCount: number
  totalSizeBytes: number
  unreadCount: number
  hasUnsubscribe: boolean
  readRate: number
  clutterScore: number
}

function calculateClutterScore(data: {
  emailCount: number
  totalSizeBytes: number
  readRate: number
  hasUnsubscribe: boolean
}): number {
  // Score de 0 à 100
  // volume (0-30), taille (0-25), taux de lecture inversé (0-25), unsubscribe (0-20)
  const volumeScore = Math.min(30, (data.emailCount / 50) * 30)
  const sizeScore = Math.min(25, (data.totalSizeBytes / (50 * 1024 * 1024)) * 25) // 50 Mo max
  const readScore = (1 - data.readRate) * 25
  const unsubScore = data.hasUnsubscribe ? 20 : 0

  return Math.round(Math.min(100, volumeScore + sizeScore + readScore + unsubScore))
}

export async function computeSenderScores(accountId: string): Promise<SenderScoreResult[]> {
  const listRes = await listMessages(accountId, { maxResults: 500 })
  if (!listRes.messages.length) return []

  const messageIds = listRes.messages.map((m: any) => m.id)
  const messages = await batchGetMessages(accountId, messageIds)

  const senderMap = new Map<string, {
    count: number
    size: number
    unread: number
    total: number
    hasUnsubscribe: boolean
  }>()

  for (const msg of messages) {
    const sender = msg.from || '(unknown)'
    const entry = senderMap.get(sender) ?? { count: 0, size: 0, unread: 0, total: 0, hasUnsubscribe: false }
    entry.count++
    entry.total++
    entry.size += msg.sizeEstimate
    if (msg.labelIds.includes('UNREAD')) entry.unread++
    senderMap.set(sender, entry)
  }

  // Vérifie List-Unsubscribe dans les archives
  const db = getDb()
  const unsubSenders = await (db
    .selectFrom('archived_mails')
    .select('sender')
    .where('gmail_account_id', '=', accountId) as any)
    .where(sql`label_ids @> ARRAY['CATEGORY_PROMOTIONS']`)
    .groupBy('sender')
    .execute()

  const unsubSet = new Set(unsubSenders.map((r: any) => r.sender))

  const results: SenderScoreResult[] = []

  for (const [sender, data] of senderMap) {
    const hasUnsubscribe = unsubSet.has(sender)
    const readRate = data.total > 0 ? (data.total - data.unread) / data.total : 1

    const clutterScore = calculateClutterScore({
      emailCount: data.count,
      totalSizeBytes: data.size,
      readRate,
      hasUnsubscribe,
    })

    results.push({
      sender,
      emailCount: data.count,
      totalSizeBytes: data.size,
      unreadCount: data.unread,
      hasUnsubscribe,
      readRate,
      clutterScore,
    })

    // Upsert
    await db
      .insertInto('sender_scores')
      .values({
        gmail_account_id: accountId,
        sender,
        email_count: data.count,
        total_size_bytes: BigInt(data.size),
        unread_count: data.unread,
        has_unsubscribe: hasUnsubscribe,
        read_rate: readRate,
        clutter_score: clutterScore,
      })
      .onConflict((oc) =>
        oc.columns(['gmail_account_id', 'sender']).doUpdateSet({
          email_count: data.count,
          total_size_bytes: BigInt(data.size),
          unread_count: data.unread,
          has_unsubscribe: hasUnsubscribe,
          read_rate: readRate,
          clutter_score: clutterScore,
          computed_at: sql`NOW()`,
        })
      )
      .execute()
  }

  return results.sort((a, b) => b.clutterScore - a.clutterScore)
}

export async function getSenderScores(accountId: string, refresh = false): Promise<SenderScoreResult[]> {
  const cacheKey = `analytics:sender-scores:${accountId}`
  if (!refresh) {
    const cached = await getCached<SenderScoreResult[]>(cacheKey)
    if (cached) return cached
  }

  const db = getDb()
  const rows = await db
    .selectFrom('sender_scores')
    .selectAll()
    .where('gmail_account_id', '=', accountId)
    .orderBy('clutter_score', 'desc')
    .execute()

  if (rows.length > 0 && !refresh) {
    const result = rows.map((r) => ({
      sender: r.sender,
      emailCount: Number(r.email_count),
      totalSizeBytes: Number(r.total_size_bytes),
      unreadCount: Number(r.unread_count),
      hasUnsubscribe: r.has_unsubscribe,
      readRate: Number(r.read_rate),
      clutterScore: Number(r.clutter_score),
    }))
    await setCache(cacheKey, result)
    return result
  }

  const result = await computeSenderScores(accountId)
  await setCache(cacheKey, result)
  return result
}

// ─── Suggestions de nettoyage intelligent ───────────────

export interface CleanupSuggestionResult {
  id: string
  type: string
  title: string
  description: string | null
  sender: string | null
  emailCount: number
  totalSizeBytes: number
  query: string | null
  isDismissed: boolean
}

export async function computeCleanupSuggestions(accountId: string): Promise<CleanupSuggestionResult[]> {
  const db = getDb()
  const scores = await getSenderScores(accountId)
  const suggestions: CleanupSuggestionResult[] = []

  // Nettoie les anciennes suggestions non-dismissed
  await db
    .deleteFrom('cleanup_suggestions')
    .where('gmail_account_id', '=', accountId)
    .where('is_dismissed', '=', false)
    .execute()

  // 1. Expéditeurs avec beaucoup de mails non lus
  for (const s of scores) {
    if (s.unreadCount >= 20) {
      const row = await db
        .insertInto('cleanup_suggestions')
        .values({
          gmail_account_id: accountId,
          type: 'bulk_unread',
          title: `${s.unreadCount} emails non lus de ${s.sender}`,
          description: `Vous avez ${s.unreadCount} emails non lus de cet expéditeur. Volume total : ${formatBytesServer(s.totalSizeBytes)}.`,
          sender: s.sender,
          email_count: s.unreadCount,
          total_size_bytes: BigInt(s.totalSizeBytes),
          query: `from:(${extractEmail(s.sender)}) is:unread`,
        })
        .returning(['id', 'type', 'title', 'description', 'sender', 'email_count', 'total_size_bytes', 'query', 'is_dismissed'])
        .executeTakeFirstOrThrow()

      suggestions.push(mapSuggestion(row))
    }
  }

  // 2. Gros expéditeurs (> 10 Mo)
  for (const s of scores) {
    if (s.totalSizeBytes > 10 * 1024 * 1024 && s.clutterScore >= 40) {
      const row = await db
        .insertInto('cleanup_suggestions')
        .values({
          gmail_account_id: accountId,
          type: 'large_sender',
          title: `${s.sender} occupe ${formatBytesServer(s.totalSizeBytes)}`,
          description: `${s.emailCount} emails pour un total de ${formatBytesServer(s.totalSizeBytes)}. Score d'encombrement : ${s.clutterScore}/100.`,
          sender: s.sender,
          email_count: s.emailCount,
          total_size_bytes: BigInt(s.totalSizeBytes),
          query: `from:(${extractEmail(s.sender)})`,
        })
        .returning(['id', 'type', 'title', 'description', 'sender', 'email_count', 'total_size_bytes', 'query', 'is_dismissed'])
        .executeTakeFirstOrThrow()

      suggestions.push(mapSuggestion(row))
    }
  }

  // 3. Newsletters avec faible taux de lecture et unsubscribe
  for (const s of scores) {
    if (s.hasUnsubscribe && s.readRate < 0.3 && s.emailCount >= 5) {
      const row = await db
        .insertInto('cleanup_suggestions')
        .values({
          gmail_account_id: accountId,
          type: 'old_newsletters',
          title: `Newsletter peu lue : ${s.sender}`,
          description: `Seulement ${Math.round(s.readRate * 100)}% de taux de lecture sur ${s.emailCount} emails. Envisagez le désabonnement.`,
          sender: s.sender,
          email_count: s.emailCount,
          total_size_bytes: BigInt(s.totalSizeBytes),
          query: `from:(${extractEmail(s.sender)})`,
        })
        .returning(['id', 'type', 'title', 'description', 'sender', 'email_count', 'total_size_bytes', 'query', 'is_dismissed'])
        .executeTakeFirstOrThrow()

      suggestions.push(mapSuggestion(row))
    }
  }

  return suggestions
}

export async function getCleanupSuggestions(accountId: string, refresh = false): Promise<CleanupSuggestionResult[]> {
  const cacheKey = `analytics:cleanup:${accountId}`
  if (!refresh) {
    const cached = await getCached<CleanupSuggestionResult[]>(cacheKey)
    if (cached) return cached
  }

  const db = getDb()

  if (!refresh) {
    const existing = await db
      .selectFrom('cleanup_suggestions')
      .selectAll()
      .where('gmail_account_id', '=', accountId)
      .where('is_dismissed', '=', false)
      .orderBy('email_count', 'desc')
      .execute()

    if (existing.length > 0) {
      const result = existing.map(mapSuggestion)
      await setCache(cacheKey, result)
      return result
    }
  }

  const result = await computeCleanupSuggestions(accountId)
  await setCache(cacheKey, result)
  return result
}

export async function dismissSuggestion(suggestionId: string): Promise<void> {
  const db = getDb()
  await db
    .updateTable('cleanup_suggestions')
    .set({ is_dismissed: true })
    .where('id', '=', suggestionId)
    .execute()
}

// ─── Inbox Zero Tracker ─────────────────────────────────

export interface InboxZeroData {
  current: { inboxCount: number; unreadCount: number }
  history: { date: string; inboxCount: number; unreadCount: number }[]
  streak: number      // jours consécutifs à inbox zero
  bestStreak: number
}

export async function recordInboxSnapshot(accountId: string): Promise<{ inboxCount: number; unreadCount: number }> {
  // Compte les mails dans INBOX
  const inboxRes = await listMessages(accountId, { query: 'in:inbox', maxResults: 1 })
  const unreadRes = await listMessages(accountId, { query: 'in:inbox is:unread', maxResults: 1 })

  const inboxCount = inboxRes.resultSizeEstimate
  const unreadCount = unreadRes.resultSizeEstimate

  const db = getDb()
  await db
    .insertInto('inbox_zero_snapshots')
    .values({
      gmail_account_id: accountId,
      inbox_count: inboxCount,
      unread_count: unreadCount,
    })
    .execute()

  return { inboxCount, unreadCount }
}

function computeStreaks(sortedHistory: { date: string; inbox_count: number }[]): { streak: number; bestStreak: number } {
  let bestStreak = 0
  let tempStreak = 0

  for (const entry of sortedHistory) {
    if (Number(entry.inbox_count) === 0) {
      tempStreak++
      if (tempStreak > bestStreak) bestStreak = tempStreak
    } else {
      tempStreak = 0
    }
  }

  // Streak actuel = jours consécutifs à inbox zero en partant d'aujourd'hui
  let streak = 0
  for (const entry of sortedHistory) {
    if (Number(entry.inbox_count) === 0) {
      streak++
    } else {
      break
    }
  }

  return { streak, bestStreak }
}

export async function getInboxZeroData(accountId: string, refresh = false): Promise<InboxZeroData> {
  const cacheKey = `analytics:inbox-zero:${accountId}`
  if (!refresh) {
    const cached = await getCached<InboxZeroData>(cacheKey)
    if (cached) return cached
  }

  const db = getDb()

  // Dernier snapshot ou en crée un nouveau
  let current: { inboxCount: number; unreadCount: number }
  const latest = await db
    .selectFrom('inbox_zero_snapshots')
    .select(['inbox_count', 'unread_count', 'recorded_at'])
    .where('gmail_account_id', '=', accountId)
    .orderBy('recorded_at', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (!latest || refresh) {
    current = await recordInboxSnapshot(accountId)
  } else {
    current = { inboxCount: latest.inbox_count, unreadCount: latest.unread_count }
  }

  // Historique des 30 derniers jours (1 point par jour max)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const history = await db
    .selectFrom('inbox_zero_snapshots')
    .select([
      sql<string>`DATE(recorded_at)`.as('date'),
      sql<number>`MIN(inbox_count)`.as('inbox_count'),
      sql<number>`MIN(unread_count)`.as('unread_count'),
    ])
    .where('gmail_account_id', '=', accountId)
    .where('recorded_at', '>=', thirtyDaysAgo)
    .groupBy(sql`DATE(recorded_at)`)
    .orderBy('date', 'asc')
    .execute()

  const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date))
  const { streak, bestStreak } = computeStreaks(sortedHistory)

  const result: InboxZeroData = {
    current,
    history: history.map((h) => ({
      date: String(h.date),
      inboxCount: Number(h.inbox_count),
      unreadCount: Number(h.unread_count),
    })),
    streak,
    bestStreak,
  }

  await setCache(cacheKey, result)
  return result
}

// ─── Helpers ────────────────────────────────────────────

function mapSuggestion(row: any): CleanupSuggestionResult {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    sender: row.sender,
    emailCount: Number(row.email_count),
    totalSizeBytes: Number(row.total_size_bytes),
    query: row.query,
    isDismissed: row.is_dismissed,
  }
}

function extractEmail(sender: string): string {
  const match = /<([^>]+)>/.exec(sender)
  return match ? match[1] : sender
}

function formatBytesServer(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`
}
