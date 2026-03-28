import { FastifyInstance } from 'fastify'
import { getDb } from '../plugins/db'
import { listMessages, batchGetMessages, getMailboxProfile } from '../gmail/gmail.service'

export async function dashboardRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }
  const db = getDb()

  // Main dashboard stats — aggregated from Gmail API
  app.get('/:accountId/stats', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { limit = '20' } = request.query as { limit?: string }

    // Fetch up to 500 messages for aggregation
    const listRes = await listMessages(accountId, { maxResults: 500 })
    const messageIds = listRes.messages.map((m: any) => m.id)
    const messages = await batchGetMessages(accountId, messageIds)

    // Aggregate by sender
    const senderMap = new Map<string, { count: number; sizeBytes: number; sender: string }>()
    for (const msg of messages) {
      const key = msg.from
      const entry = senderMap.get(key) ?? { count: 0, sizeBytes: 0, sender: msg.from }
      entry.count++
      entry.sizeBytes += msg.sizeEstimate
      senderMap.set(key, entry)
    }

    const bySender = [...senderMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit))

    const biggestMails = [...messages]
      .sort((a, b) => b.sizeEstimate - a.sizeEstimate)
      .slice(0, parseInt(limit))

    // Label distribution
    const labelMap = new Map<string, number>()
    for (const msg of messages) {
      for (const label of msg.labelIds) {
        labelMap.set(label, (labelMap.get(label) ?? 0) + 1)
      }
    }

    const unreadCount = messages.filter((m) => m.labelIds.includes('UNREAD')).length

    // Timeline: mails per month
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

    return {
      totalMessages: listRes.resultSizeEstimate,
      unreadCount,
      totalSizeBytes: messages.reduce((s, m) => s + m.sizeEstimate, 0),
      bySender,
      biggestMails,
      byLabel: [...labelMap.entries()].map(([label, count]) => ({ label, count })),
      timeline,
      profile,
    }
  })

  // Archive stats from DB
  app.get('/:accountId/archive-stats', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const [totals] = await db`
      SELECT
        COUNT(*)            AS total_mails,
        SUM(size_bytes)     AS total_size,
        MAX(archived_at)    AS last_archived_at
      FROM archived_mails
      WHERE gmail_account_id = ${accountId}
    `
    const bySender = await db`
      SELECT sender, COUNT(*) AS count, SUM(size_bytes) AS total_size
      FROM archived_mails
      WHERE gmail_account_id = ${accountId}
      GROUP BY sender ORDER BY count DESC LIMIT 20
    `
    return { ...totals, bySender }
  })
}
