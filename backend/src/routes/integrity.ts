import { FastifyInstance } from 'fastify'
import { checkArchiveIntegrity } from '../archive/integrity.service'
import { enqueueJob } from '../jobs/queue'

export async function integrityRoutes(app: FastifyInstance) {
  // ─── Run integrity check (admin only) ─────────────────
  app.get('/check', { preHandler: [app.authenticate, app.requireAdmin] }, async (request) => {
    const { accountId } = request.query as { accountId?: string }
    const result = await checkArchiveIntegrity(accountId)
    return result
  })

  // ─── Enqueue as background job ────────────────────────
  app.post('/check/async', { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const job = await enqueueJob('integrity_check', { accountId: '', userId })
    return reply.code(202).send({ jobId: job.id, message: 'Integrity check enqueued' })
  })
}
