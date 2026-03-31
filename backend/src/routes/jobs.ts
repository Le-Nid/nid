import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { getQueue } from '../jobs/queue'
import { notFound } from '../utils/db'
import { authPresets } from '../utils/auth'

export async function jobRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  const db   = getDb()

  app.get('/', auth, async (request) => {
    const userId = request.user.sub
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
    const userId = request.user.sub
    const { jobId } = request.params as { jobId: string }

    const job = await db
      .selectFrom('jobs')
      .selectAll()
      .where('id', '=', jobId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return notFound(reply)

    const queue   = getQueue()
    const bullJob = await queue.getJob(job.bullmq_id ?? '')
    return { ...job, bullmqState: await bullJob?.getState() }
  })

  app.delete('/:jobId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { jobId } = request.params as { jobId: string }

    const job = await db
      .selectFrom('jobs')
      .select('bullmq_id')
      .where('id', '=', jobId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return notFound(reply)

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
