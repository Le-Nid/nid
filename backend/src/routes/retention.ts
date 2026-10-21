import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getRetentionPolicies,
  createRetentionPolicy,
  updateRetentionPolicy,
  deleteRetentionPolicy,
  applyRetentionPolicies,
  isKnownPolicyLabel,
} from '../archive/retention.service'
import { authPresets } from '../utils/auth'

// L6/B9: only new writes are checked; existing free-text labels stay as they are
function labelSchema(userId: string, scope: { accountId?: string; policyId?: string }) {
  return z.object({ label: z.string().max(255).optional() }).refine(
    async ({ label }) => !label || isKnownPolicyLabel(userId, label, scope),
    { message: 'Unknown Gmail label for this account', path: ['label'] },
  )
}

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
    await labelSchema(userId, { accountId: body.gmailAccountId }).parseAsync(body)

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
    await labelSchema(userId, { policyId }).parseAsync(body)

    return updateRetentionPolicy(policyId, userId, body)
  })

  // ─── Delete retention policy ──────────────────────────────
  app.delete('/:policyId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { policyId } = request.params as { policyId: string }
    await deleteRetentionPolicy(policyId, userId)
    return reply.code(204).send()
  })

  // ─── Run the caller's retention policies now (manual trigger) ──────
  app.post('/run', auth, async (request) => {
    return applyRetentionPolicies(request.user.sub)
  })
}
