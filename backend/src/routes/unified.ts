import { FastifyInstance } from 'fastify'
import { listMessages, batchGetMessages, type MailMeta } from '../gmail/gmail.service'
import { getDb } from '../db'
import { authPresets } from '../utils/auth'

export async function unifiedRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  const db = getDb()

  // ─── Unified inbox: merge all gmail accounts ─────────────
  app.get('/messages', auth, async (request) => {
    const userId = request.user.sub
    const { q, maxResults } = request.query as {
      q?: string
      maxResults?: string
    }

    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email'])
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute()

    if (!accounts.length) return { messages: [], accounts: [] }

    const limit = Math.min(Number(maxResults) || 20, 50)

    // Fetch messages from all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const res = await listMessages(account.id, {
          query: q,
          maxResults: limit,
        })
        const ids = (res.messages ?? []).map((m: any) => m.id)
        if (!ids.length) return []

        const mails = await batchGetMessages(account.id, ids)
        return mails.map((m) => ({
          ...m,
          accountId: account.id,
          accountEmail: account.email,
        }))
      })
    )

    // Collect successful results, ignore failures
    const allMails: (MailMeta & { accountId: string; accountEmail: string })[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') allMails.push(...r.value)
    }

    // Sort by date descending
    allMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return {
      messages: allMails,
      accounts: accounts.map((a) => ({ id: a.id, email: a.email })),
    }
  })
}
