import { FastifyInstance } from 'fastify'
import { getDb } from '../plugins/db'
import { getQueue } from '../jobs/queue'

export async function jobRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }
  const db = getDb()

  app.get('/', auth, async (request) => {
    const { status, accountId } = request.query as { status?: string; accountId?: string }
    const jobs = await db`
      SELECT * FROM jobs
      WHERE 1=1
        ${status ? db`AND status = ${status}` : db``}
        ${accountId ? db`AND gmail_account_id = ${accountId}` : db``}
      ORDER BY created_at DESC
      LIMIT 50
    `
    return jobs
  })

  app.get('/:jobId', auth, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const [job] = await db`SELECT * FROM jobs WHERE id = ${jobId}`
    if (!job) return reply.code(404).send({ error: 'Not found' })

    // Enrich with live BullMQ state
    const queue = getQueue()
    const bullJob = await queue.getJob(job.bullmq_id)
    return { ...job, bullmqState: await bullJob?.getState() }
  })

  app.delete('/:jobId', auth, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const [job] = await db`SELECT bullmq_id FROM jobs WHERE id = ${jobId}`
    if (!job) return reply.code(404).send({ error: 'Not found' })

    const queue = getQueue()
    const bullJob = await queue.getJob(job.bullmq_id)
    await bullJob?.remove()

    await db`UPDATE jobs SET status = 'cancelled' WHERE id = ${jobId}`
    return reply.code(204).send()
  })
}
