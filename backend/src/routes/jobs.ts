import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { getQueue } from '../jobs/queue'
import { notFound, UUID_RE } from '../utils/db'
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

    // Enqueue routes return the BullMQ id (undo toast), the jobs list returns the row id: accept both, like the SSE route
    const job = await db
      .selectFrom('jobs')
      .select(['id', 'bullmq_id'])
      .where((eb) =>
        UUID_RE.test(jobId)
          ? eb.or([eb('bullmq_id', '=', jobId), eb('id', '=', jobId)])
          : eb('bullmq_id', '=', jobId)
      )
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return notFound(reply)

    if (job.bullmq_id) {
      const queue   = getQueue()
      const bullJob = await queue.getJob(job.bullmq_id)
      try {
        await bullJob?.remove()
      } catch (err) {
        // BullMQ refuses to remove a locked (active) job; stopping a running job is not supported yet
        if (await bullJob?.getState() !== 'active') throw err
        return reply.code(409).send({ error: 'Job is already running and cannot be cancelled' })
      }
    }

    await db
      .updateTable('jobs')
      .set({ status: 'cancelled' })
      .where('id', '=', job.id)
      .execute()

    return reply.code(204).send()
  })
}
