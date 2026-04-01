import { FastifyInstance } from 'fastify'
import {
  getRetentionPolicies,
  createRetentionPolicy,
  updateRetentionPolicy,
  deleteRetentionPolicy,
  applyRetentionPolicies,
} from '../archive/retention.service'
import { authPresets } from '../utils/auth'

export async function retentionRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)

  // ─── List retention policies ──────────────────────────────
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    return getRetentionPolicies(userId)
  })

  // ─── Create retention policy ──────────────────────────────
  app.post('/', auth, async (request, reply) => {
    const userId = request.user.sub
    const body = request.body as {
      name: string
      gmailAccountId?: string
      label?: string
      maxAgeDays: number
    }

    if (!body.name || !body.maxAgeDays || body.maxAgeDays < 1) {
      return reply.code(400).send({ error: 'name et maxAgeDays (>= 1) requis' })
    }

    const policy = await createRetentionPolicy({
      userId,
      gmailAccountId: body.gmailAccountId,
      name: body.name,
      label: body.label,
      maxAgeDays: body.maxAgeDays,
    })

    return reply.code(201).send(policy)
  })

  // ─── Update retention policy ──────────────────────────────
  app.put('/:policyId', auth, async (request) => {
    const userId = request.user.sub
    const { policyId } = request.params as { policyId: string }
    const body = request.body as {
      name?: string
      label?: string
      maxAgeDays?: number
      isActive?: boolean
    }

    return updateRetentionPolicy(policyId, userId, body)
  })

  // ─── Delete retention policy ──────────────────────────────
  app.delete('/:policyId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { policyId } = request.params as { policyId: string }
    await deleteRetentionPolicy(policyId, userId)
    return reply.code(204).send()
  })

  // ─── Run all retention policies now (manual trigger) ──────
  app.post('/run', auth, async (request) => {
    return applyRetentionPolicies()
  })
}
