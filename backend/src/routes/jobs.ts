import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { enqueueJob, getQueue, type JobPayload, type JobType } from '../jobs/queue'
import { notFound, UUID_RE } from '../utils/db'
import { authPresets } from '../utils/auth'

/** Types whose credentials enqueueJob redacts from the stored payload (see redactSecrets). */
const SECRET_JOB_TYPES = new Set(['import_imap', 'decrypt_archives'])

const STATUSES = ['scheduled', 'pending', 'active', 'completed', 'failed', 'cancelled'] as const
const HISTORY_DAYS = 30
const listQuery = z.object({
  status: z.string().transform((s) => s.split(',')).pipe(z.array(z.enum(STATUSES))).optional(),
  accountId: z.string().regex(UUID_RE).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  withCounts: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
})

export async function jobRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  const db   = getDb()

  // Activité (§7.6): `status` takes a comma list (« En attente » = scheduled,pending); `withCounts` adds the per-status
  // counts of the same account filter for the chips, and wraps the list as { jobs, counts }.
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    const { status, accountId, limit, withCounts } = listQuery.parse(request.query)

    // shortcut: rows are never purged, the page only shows the last 30 days; add a purge job if the table grows too big
    let base = db
      .selectFrom('jobs')
      .where('user_id', '=', userId)
      .where('created_at', '>', new Date(Date.now() - HISTORY_DAYS * 86_400_000))
    if (accountId) base = base.where('account_id', '=', accountId)

    let list = base.selectAll().orderBy('created_at', 'desc').limit(limit)
    if (status) list = list.where('status', 'in', status)
    const jobs = await list.execute()
    if (!withCounts) return jobs

    const rows = await base.select(['status', (eb) => eb.fn.countAll<string>().as('count')]).groupBy('status').execute()
    return { jobs, counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])) }
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

  // B11: re-enqueue the same payload under a new id. The stored payload is the redacted copy, so job types whose
  // credentials were stripped (IMAP password, passphrase) cannot be replayed from it.
  app.post('/:jobId/retry', auth, async (request, reply) => {
    const userId = request.user.sub
    const { jobId } = request.params as { jobId: string }

    const job = await db
      .selectFrom('jobs')
      .select(['id', 'type', 'payload'])
      .where((eb) =>
        UUID_RE.test(jobId)
          ? eb.or([eb('bullmq_id', '=', jobId), eb('id', '=', jobId)])
          : eb('bullmq_id', '=', jobId)
      )
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!job) return notFound(reply)
    if (SECRET_JOB_TYPES.has(job.type))
      return reply.code(409).send({ error: 'This job needs credentials that are not stored: start it again from its page' })

    const payload = (typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload) as JobPayload
    const next = await enqueueJob(job.type as JobType, { ...payload, userId, retryOf: job.id })
    return reply.code(202).send({ jobId: next.id, retryOf: job.id })
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
