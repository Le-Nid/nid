import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { authPresets } from '../utils/auth'

export async function configRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  // ─── Export config (rules + webhooks) ─────────────────
  app.get('/export', auth, async (request) => {
    const userId = request.user.sub

    // Get all user's gmail accounts
    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email'])
      .where('user_id', '=', userId)
      .execute()

    const accountIds = accounts.map((a) => a.id)

    // Get rules for all accounts
    const rules = accountIds.length > 0
      ? await db
          .selectFrom('rules')
          .selectAll()
          .where('gmail_account_id', 'in', accountIds)
          .execute()
      : []

    // Get webhooks
    const webhooks = await db
      .selectFrom('webhooks')
      .selectAll()
      .where('user_id', '=', userId)
      .execute()

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      accounts: accounts.map((a) => ({
        email: a.email,
        rules: rules
          .filter((r) => r.gmail_account_id === a.id)
          .map((r) => ({
            name: r.name,
            description: r.description,
            conditions: r.conditions,
            action: r.action,
            schedule: r.schedule,
            is_active: r.is_active,
          })),
      })),
      webhooks: webhooks.map((w) => ({
        name: w.name,
        url: w.url,
        type: w.type,
        events: w.events,
        is_active: w.is_active,
      })),
    }
  })

  // ─── Import config ────────────────────────────────────
  app.post('/import', auth, async (request, reply) => {
    const userId = request.user.sub

    const body = z.object({
      version: z.string(),
      accounts: z.array(z.object({
        email: z.string(),
        rules: z.array(z.object({
          name: z.string(),
          description: z.string().nullable().optional(),
          conditions: z.any(),
          action: z.any(),
          schedule: z.string().nullable().optional(),
          is_active: z.boolean().optional(),
        })),
      })).optional(),
      webhooks: z.array(z.object({
        name: z.string(),
        url: z.string().url(),
        type: z.string().optional(),
        events: z.array(z.string()),
        is_active: z.boolean().optional(),
      })).optional(),
    }).parse(request.body)

    let rulesImported = 0
    let webhooksImported = 0

    // Import rules — match accounts by email
    if (body.accounts) {
      for (const acct of body.accounts) {
        const dbAccount = await db
          .selectFrom('gmail_accounts')
          .select('id')
          .where('email', '=', acct.email)
          .where('user_id', '=', userId)
          .executeTakeFirst()

        if (!dbAccount) continue

        for (const rule of acct.rules) {
          await db
            .insertInto('rules')
            .values({
              gmail_account_id: dbAccount.id,
              name: rule.name,
              description: rule.description ?? null,
              conditions: JSON.stringify(rule.conditions),
              action: JSON.stringify(rule.action),
              schedule: rule.schedule ?? null,
              is_active: rule.is_active ?? true,
            })
            .execute()
          rulesImported++
        }
      }
    }

    // Import webhooks
    if (body.webhooks) {
      for (const wh of body.webhooks) {
        await db
          .insertInto('webhooks')
          .values({
            user_id: userId,
            name: wh.name,
            url: wh.url,
            type: wh.type ?? 'generic',
            events: wh.events,
            is_active: wh.is_active ?? true,
          })
          .execute()
        webhooksImported++
      }
    }

    return { rulesImported, webhooksImported }
  })
}
