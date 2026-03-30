import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { getQueue } from '../jobs/queue'

export async function jobRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }
  const db   = getDb()

  app.get('/', auth, async (request) => {
    const { sub: userId } = request.user as { sub: string }
    const { status, accountId } = request.query as { status?: string; accountId?: string }

    let query = db
      .selectFrom('jobs')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(50)

    if (status)    query = query.where('status', '=', status)
    if (accountId) query = query.where('gmail_account_id', '=', accountId)

    return query.execute()
  })

  app.get('/:jobId', auth, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { jobId } = request.params as { jobId: string }

    const job = await db
      .selectFrom('jobs')
      .selectAll()
      .where('id', '=', jobId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return reply.code(404).send({ error: 'Not found' })

    const queue   = getQueue()
    const bullJob = await queue.getJob(job.bullmq_id ?? '')
    return { ...job, bullmqState: await bullJob?.getState() }
  })

  app.delete('/:jobId', auth, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { jobId } = request.params as { jobId: string }

    const job = await db
      .selectFrom('jobs')
      .select('bullmq_id')
      .where('id', '=', jobId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return reply.code(404).send({ error: 'Not found' })

    if (job.bullmq_id) {
      const queue   = getQueue()
      const bullJob = await queue.getJob(job.bullmq_id)
      await bullJob?.remove()
    }

    await db
      .updateTable('jobs')
      .set({ status: 'cancelled' })
      .where('id', '=', jobId)
      .execute()

    return reply.code(204).send()
  })
}
