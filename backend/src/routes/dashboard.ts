import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { listMessages, batchGetMessages, getMailboxProfile } from '../gmail/gmail.service'
import { getCachedStats, setCachedStats, getCachedArchiveStats, setCachedArchiveStats } from '../dashboard/cache.service'

export async function dashboardRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate, app.requireAccountOwnership] }

  app.get('/:accountId/stats', auth, async (request) => {
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

    const unreadCount = messages.filter((m) => m.labelIds.includes('UNREAD')).length

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

    const profile = await getMailboxProfile(accountId)
    const stats = {
      totalMessages:  listRes.resultSizeEstimate,
      unreadCount,
      totalSizeBytes: messages.reduce((s, m) => s + m.sizeEstimate, 0),
      bySender, biggestMails,
      byLabel: [...labelMap.entries()].map(([label, count]) => ({ label, count })),
      timeline, profile,
      cachedAt: new Date().toISOString(),
    }
    await setCachedStats(accountId, stats)
    return stats
  })

  app.get('/:accountId/archive-stats', auth, async (request) => {
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

    const stats = { ...totals, bySender, cachedAt: new Date().toISOString() }
    await setCachedArchiveStats(accountId, stats)
    return stats
  })
}
