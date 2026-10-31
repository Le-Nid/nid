import { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { getDb } from '../db'
import { listMessages, batchGetMessages, getMailboxProfile, getLabelStats } from '../gmail/gmail.service'
import { getCachedStats, setCachedStats, getCachedArchiveStats, setCachedArchiveStats } from '../dashboard/cache.service'
import { authPresets } from '../utils/auth'

export async function dashboardRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  app.get('/:accountId/stats', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { limit = '20', refresh } = request.query as { limit?: string; refresh?: string }

    if (refresh !== '1') {
      const cached = await getCachedStats(accountId)
      if (cached) return cached
    }

    const listRes    = await listMessages(accountId, { maxResults: 500 })
    const messageIds = listRes.messages.map((m: any) => m.id)
    const messages   = await batchGetMessages(accountId, messageIds)

    const senderMap = new Map<string, { count: number; sizeBytes: number; sender: string }>()
    for (const msg of messages) {
      const entry = senderMap.get(msg.from) ?? { count: 0, sizeBytes: 0, sender: msg.from }
      entry.count++
      entry.sizeBytes += msg.sizeEstimate
      senderMap.set(msg.from, entry)
    }

    const lim = parseInt(limit)
    const bySender     = [...senderMap.values()].sort((a, b) => b.count - a.count).slice(0, lim)
    const biggestMails = [...messages].sort((a, b) => b.sizeEstimate - a.sizeEstimate).slice(0, lim)

    const labelMap = new Map<string, number>()
    for (const msg of messages)
      for (const label of msg.labelIds)
        labelMap.set(label, (labelMap.get(label) ?? 0) + 1)

    const timelineMap = new Map<string, number>()
    for (const msg of messages) {
      const d = new Date(msg.date)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      timelineMap.set(key, (timelineMap.get(key) ?? 0) + 1)
    }
    const timeline = [...timelineMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }))

    const [profile, unreadLabel] = await Promise.all([
      getMailboxProfile(accountId),
      getLabelStats(accountId, 'UNREAD'),
    ])
    const stats = {
      totalMessages:  profile.messagesTotal ?? listRes.resultSizeEstimate,
      unreadCount:    unreadLabel.messagesTotal ?? messages.filter((m) => m.labelIds.includes('UNREAD')).length,
      totalSizeBytes: messages.reduce((s, m) => s + m.sizeEstimate, 0),
      bySender, biggestMails,
      byLabel: [...labelMap.entries()].map(([label, count]) => ({ label, count })),
      timeline, profile,
      cachedAt: new Date().toISOString(),
    }
    await setCachedStats(accountId, stats)
    return stats
  })

  app.get('/:accountId/archive-stats', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }

    const cached = await getCachedArchiveStats(accountId)
    if (cached) return cached

    const db = getDb()

    const totals = await db
      .selectFrom('archived_mails')
      .select((eb) => [
        eb.fn.countAll<number>().as('total_mails'),
        eb.fn.sum<number>('size_bytes').as('total_size'),
        eb.fn.max('archived_at').as('last_archived_at'),
      ])
      .where('gmail_account_id', '=', accountId)
      .executeTakeFirstOrThrow()

    const bySender = await db
      .selectFrom('archived_mails')
      .select((eb) => [
        'sender',
        eb.fn.countAll<number>().as('count'),
        eb.fn.sum<number>('size_bytes').as('total_size'),
      ])
      .where('gmail_account_id', '=', accountId)
      .groupBy('sender')
      .orderBy('count', 'desc')
      .limit(20)
      .execute()

    // Overview (§7.1): mails received per day over the last 30 UTC days, the heaviest mails and attachments
    const days = Array.from({ length: 30 }, (_, k) => new Date(Date.now() - (29 - k) * 86_400_000).toISOString().slice(0, 10))
    const hashed = () => db.selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .where('archived_mails.gmail_account_id', '=', accountId)
      .where('archived_attachments.content_hash', 'is not', null)
    const [perDay, biggestMails, biggestAttachments, allHashed, uniqueHashed] = await Promise.all([
      db.selectFrom('archived_mails')
        .select((eb) => [sql<string>`to_char(date AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('day'), eb.fn.countAll<string>().as('count')])
        .where('gmail_account_id', '=', accountId).where('deleted_at', 'is', null)
        .where('date', '>=', new Date(`${days[0]}T00:00:00Z`))
        .groupBy(sql`1`)
        .execute(),
      db.selectFrom('archived_mails')
        .select(['id', 'subject', 'sender', 'size_bytes', 'date'])
        .where('gmail_account_id', '=', accountId).where('deleted_at', 'is', null)
        .orderBy('size_bytes', 'desc').limit(5).execute(),
      db.selectFrom('archived_attachments')
        .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
        .select(['archived_attachments.id', 'archived_attachments.filename', 'archived_attachments.size_bytes', 'archived_mails.subject'])
        .where('archived_mails.gmail_account_id', '=', accountId).where('archived_mails.deleted_at', 'is', null)
        .orderBy('archived_attachments.size_bytes', 'desc').limit(5).execute(),
      hashed().select((eb) => eb.fn.sum<string>('archived_attachments.size_bytes').as('total')).executeTakeFirst(),
      // One copy per content hash is what is really stored; the other copies are what deduplication saves
      db.selectFrom(hashed().distinctOn('archived_attachments.content_hash')
        .select('archived_attachments.size_bytes').orderBy('archived_attachments.content_hash').as('u'))
        .select((eb) => eb.fn.sum<string>('u.size_bytes').as('total')).executeTakeFirst(),
    ])
    const counts = new Map((perDay ?? []).map((r) => [r.day, Number(r.count)]))
    const daily = days.map((day) => ({ day, count: counts.get(day) ?? 0 }))

    const stats = {
      ...totals, bySender, daily, biggestMails, biggestAttachments,
      dedup_saved_bytes: Number(allHashed?.total ?? 0) - Number(uniqueHashed?.total ?? 0),
      cachedAt: new Date().toISOString(),
    }
    await setCachedArchiveStats(accountId, stats)
    return stats
  })
}
