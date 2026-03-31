import { FastifyInstance } from 'fastify'
import { checkArchiveIntegrity } from '../archive/integrity.service'
import { enqueueJob } from '../jobs/queue'
import { authPresets } from '../utils/auth'

export async function integrityRoutes(app: FastifyInstance) {
  const { adminAuth } = authPresets(app)

  // ─── Run integrity check (admin only) ─────────────────
  app.get('/check', adminAuth, async (request) => {
    const { accountId } = request.query as { accountId?: string }
    const result = await checkArchiveIntegrity(accountId)
    return result
  })

  // ─── Enqueue as background job ────────────────────────
  app.post('/check/async', adminAuth, async (request, reply) => {
    const userId = request.user.sub
    const job = await enqueueJob('integrity_check', { accountId: '', userId })
    return reply.code(202).send({ jobId: job.id, message: 'Integrity check enqueued' })
  })
}
