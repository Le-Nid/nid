import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getExpirations,
  createExpiration,
  createExpirationsBatch,
  deleteExpiration,
  updateExpirationDate,
  getExpirationStats,
  detectCategory,
  getSuggestedDays,
} from '../expiration/expiration.service'
import { authPresets } from '../utils/auth'

const createSchema = z.object({
  gmailMessageId: z.string().min(1),
  subject: z.string().optional(),
  sender: z.string().optional(),
  expiresAt: z.string().optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
  category: z.enum(['manual', 'otp', 'delivery', 'promo']).optional(),
})

const batchCreateSchema = z.object({
  items: z.array(createSchema).min(1).max(100),
})

const detectSchema = z.object({
  messages: z.array(z.object({
    gmailMessageId: z.string().min(1),
    subject: z.string().nullable().optional(),
    sender: z.string().nullable().optional(),
  })).min(1).max(500),
})

export async function expirationRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── List expirations ─────────────────────────────────────
  app.get('/:accountId', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getExpirations(accountId)
  })

  // ─── Stats ────────────────────────────────────────────────
  app.get('/:accountId/stats', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getExpirationStats(accountId)
  })

  // ─── Create single expiration ─────────────────────────────
  app.post('/:accountId', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const dto = createSchema.parse(request.body)
    const created = await createExpiration(accountId, dto)
    return reply.code(201).send(created)
  })

  // ─── Create batch expirations ─────────────────────────────
  app.post('/:accountId/batch', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { items } = batchCreateSchema.parse(request.body)
    const created = await createExpirationsBatch(accountId, items)
    return reply.code(201).send(created)
  })

  // ─── Detect temporary emails (heuristic) ──────────────────
  app.post('/:accountId/detect', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { messages } = detectSchema.parse(request.body)

    const detected = messages
      .map((msg) => {
        const category = detectCategory(msg.subject ?? null, msg.sender ?? null)
        if (!category) return null
        return {
          gmailMessageId: msg.gmailMessageId,
          subject: msg.subject ?? null,
          sender: msg.sender ?? null,
          category,
          suggestedDays: getSuggestedDays(category),
        }
      })
      .filter(Boolean)

    return detected
  })

  // ─── Update expiration date ───────────────────────────────
  app.patch('/:accountId/:expirationId', accountAuth, async (request) => {
    const { accountId, expirationId } = request.params as { accountId: string; expirationId: string }
    const { expiresAt } = z.object({ expiresAt: z.string() }).parse(request.body)
    return updateExpirationDate(expirationId, accountId, expiresAt)
  })

  // ─── Delete expiration ────────────────────────────────────
  app.delete('/:accountId/:expirationId', accountAuth, async (request, reply) => {
    const { accountId, expirationId } = request.params as { accountId: string; expirationId: string }
    await deleteExpiration(expirationId, accountId)
    return reply.code(204).send()
  })
}
