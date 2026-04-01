import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createShareLink,
  getSharedMail,
  getUserShares,
  revokeShare,
} from '../archive/sharing.service'
import { authPresets } from '../utils/auth'

const createShareSchema = z.object({
  archivedMailId: z.string().uuid(),
  expiresInHours: z.number().min(1).max(720).optional(),  // max 30 days
  maxAccess: z.number().min(1).max(1000).optional(),
})

export async function sharingRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)

  // ─── Create share link (authenticated) ────────────────────
  app.post('/', auth, async (request, reply) => {
    const userId = request.user.sub
    const dto = createShareSchema.parse(request.body)
    const share = await createShareLink(userId, dto)
    return reply.code(201).send(share)
  })

  // ─── List my shares (authenticated) ───────────────────────
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    return getUserShares(userId)
  })

  // ─── Revoke a share (authenticated) ───────────────────────
  app.delete('/:shareId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { shareId } = request.params as { shareId: string }
    const revoked = await revokeShare(shareId, userId)
    if (!revoked) {
      return reply.code(404).send({ error: 'Share not found' })
    }
    return reply.code(204).send()
  })

  // ─── Access shared mail (PUBLIC — no auth) ────────────────
  app.get('/public/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    // Validate token format (64 hex chars)
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return reply.code(400).send({ error: 'Invalid token format' })
    }

    const mail = await getSharedMail(token)
    if (!mail) {
      return reply.code(404).send({ error: 'Share not found, expired, or access limit reached' })
    }

    return mail
  })
}
