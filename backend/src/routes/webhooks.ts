import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import * as crypto from 'crypto'
import { notFound } from '../utils/db'
import { authPresets } from '../utils/auth'

const webhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  type: z.enum(['generic', 'discord', 'slack', 'ntfy']).default('generic'),
  events: z.array(z.enum([
    'job.completed', 'job.failed', 'rule.executed', 'quota.warning', 'integrity.failed',
  ])).min(1),
})

export async function webhookRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  // ─── List webhooks ────────────────────────────────────
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    return db
      .selectFrom('webhooks')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute()
  })

  // ─── Create webhook ──────────────────────────────────
  app.post('/', auth, async (request, reply) => {
    const userId = request.user.sub
    const body = webhookSchema.parse(request.body)

    const secret = body.type === 'generic' ? crypto.randomBytes(32).toString('hex') : null

    const webhook = await db
      .insertInto('webhooks')
      .values({
        user_id: userId,
        name: body.name,
        url: body.url,
        type: body.type,
        events: body.events,
        secret,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return reply.code(201).send(webhook)
  })

  // ─── Update webhook ──────────────────────────────────
  app.put('/:webhookId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { webhookId } = request.params as { webhookId: string }
    const body = webhookSchema.partial().parse(request.body)

    const updated = await db
      .updateTable('webhooks')
      .set(body as any)
      .where('id', '=', webhookId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst()

    if (!updated) return notFound(reply)
    return updated
  })

  // ─── Toggle active ───────────────────────────────────
  app.patch('/:webhookId/toggle', auth, async (request, reply) => {
    const userId = request.user.sub
    const { webhookId } = request.params as { webhookId: string }

    const webhook = await db
      .selectFrom('webhooks')
      .select(['id', 'is_active'])
      .where('id', '=', webhookId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!webhook) return notFound(reply)

    const updated = await db
      .updateTable('webhooks')
      .set({ is_active: !webhook.is_active })
      .where('id', '=', webhookId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return updated
  })

  // ─── Delete webhook ──────────────────────────────────
  app.delete('/:webhookId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { webhookId } = request.params as { webhookId: string }

    await db
      .deleteFrom('webhooks')
      .where('id', '=', webhookId)
      .where('user_id', '=', userId)
      .execute()

    return reply.code(204).send()
  })

  // ─── Test webhook ────────────────────────────────────
  app.post('/:webhookId/test', auth, async (request, reply) => {
    const userId = request.user.sub
    const { webhookId } = request.params as { webhookId: string }

    const webhook = await db
      .selectFrom('webhooks')
      .selectAll()
      .where('id', '=', webhookId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!webhook) return notFound(reply)

    const { triggerWebhooks } = await import('../webhooks/webhook.service')
    await triggerWebhooks(userId, 'job.completed', {
      test: true,
      message: 'Test webhook from Nid',
    })

    return { success: true }
  })
}
