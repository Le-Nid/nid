import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { logAudit } from '../audit/audit.service'
import { createApiToken } from '../auth/api-tokens.service'
import { authPresets } from '../utils/auth'
import { UUID_RE, notFound } from '../utils/db'

const MAX_TOKENS_PER_USER = 20

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  scope: z.enum(['read', 'write']).default('read'),
  expires_in_days: z.number().int().min(1).max(3650).nullable().default(null),
})

// Mounted under /api/auth: an API token can never reach these routes (see authenticate), only the session cookie
export async function apiTokenRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  app.get('/', auth, (request) => db
    .selectFrom('api_tokens')
    .select(['id', 'name', 'scope', 'expires_at', 'last_used_at', 'created_at'])
    .where('user_id', '=', request.user.sub)
    .orderBy('created_at')
    .execute())

  app.post('/', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = createSchema.parse(request.body)
    const userId = request.user.sub
    const { count } = await db.selectFrom('api_tokens').select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId).executeTakeFirstOrThrow()
    if (Number(count) >= MAX_TOKENS_PER_USER) {
      return reply.code(409).send({ error: `Maximum ${MAX_TOKENS_PER_USER} API tokens: revoke one first` })
    }
    const created = await createApiToken(userId, body.name, body.scope, body.expires_in_days)
    await logAudit(userId, 'user.api_token_create', { targetType: 'api_token', targetId: created.id, details: { scope: body.scope }, ipAddress: request.ip })
    return reply.code(201).send(created)
  })

  app.delete('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!UUID_RE.test(id)) return notFound(reply, 'API token not found')
    const removed = await db.deleteFrom('api_tokens').where('id', '=', id).where('user_id', '=', request.user.sub)
      .returning('id').executeTakeFirst()
    if (!removed) return notFound(reply, 'API token not found')
    await logAudit(request.user.sub, 'user.api_token_revoke', { targetType: 'api_token', targetId: id, ipAddress: request.ip })
    return reply.code(204).send()
  })
}
