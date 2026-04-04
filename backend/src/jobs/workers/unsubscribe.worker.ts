import { Worker, Job } from 'bullmq'
import { getRedis } from '../../plugins/redis'
import { getDb } from '../../db'
import { scanNewsletters } from '../../unsubscribe/unsubscribe.service'
import pino from 'pino'

const unsubLogger = pino({ name: 'unsubscribe-worker' })

interface ScanUnsubscribePayload {
  accountId: string
  userId?: string
}

export function startUnsubscribeWorker() {
  const worker = new Worker<ScanUnsubscribePayload>(
    'nid',
    async (job: Job<ScanUnsubscribePayload>) => {
      if (job.name !== 'scan_unsubscribe') return
      const { accountId } = job.data
      const db = getDb()

      await db
        .insertInto('jobs')
        .values({
          bullmq_id: String(job.id),
          type: 'scan_unsubscribe',
          status: 'active',
          gmail_account_id: accountId,
          user_id: job.data.userId ?? null,
          payload: JSON.stringify(job.data),
        })
        .onConflict((oc: any) => oc.doNothing())
        .execute()

      try {
        const newsletters = await scanNewsletters(accountId, async (done, total) => {
          const progress = total > 0 ? Math.round((done / total) * 100) : 0
          await job.updateProgress(progress)
          await db
            .updateTable('jobs')
            .set({ progress, processed: done, total })
            .where('bullmq_id', '=', String(job.id))
            .execute()
        })

        await db
          .updateTable('jobs')
          .set({
            status: 'completed',
            progress: 100,
            completed_at: new Date(),
            payload: JSON.stringify({ ...job.data, result: { count: newsletters.length } }),
          })
          .where('bullmq_id', '=', String(job.id))
          .execute()

        return newsletters
      } catch (err) {
        await db
          .updateTable('jobs')
          .set({ status: 'failed', error: String(err) })
          .where('bullmq_id', '=', String(job.id))
          .execute()
        throw err
      }
    },
    { connection: getRedis(), concurrency: 1 }
  )
  worker.on('failed', (job, err) =>
    unsubLogger.error({ jobId: job?.id, err: err.message }, 'Unsubscribe scan job failed')
  )
  return worker
}
