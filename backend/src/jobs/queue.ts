import { Queue, Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { getDb } from '../db'
import { config } from '../config'

export type JobType =
  | 'bulk_operation'
  | 'archive_mails'
  | 'run_rule'
  | 'sync_dashboard'
  | 'scan_unsubscribe'
  | 'scan_attachments'
  | 'generate_report'
  | 'integrity_check'
  | 'scan_tracking'
  | 'scan_pii'
  | 'encrypt_archives'

export interface JobPayload {
  accountId: string
  userId?: string
  [key: string]: unknown
}

let _queue: Queue | null = null

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('gmail-manager', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    })
  }
  return _queue
}

export async function enqueueJob(type: JobType, payload: JobPayload) {
  const queue = getQueue()
  const job = await queue.add(type, payload, { jobId: `${type}-${Date.now()}` })

  // Pre-insert job row so SSE can find it immediately
  const db = getDb()
  await db
    .insertInto('jobs')
    .values({
      bullmq_id: String(job.id),
      type,
      status: 'pending',
      progress: 0,
      processed: 0,
      total: 0,
      gmail_account_id: payload.accountId,
      user_id: payload.userId ?? null,
      payload: JSON.stringify(payload),
    })
    .onConflict((oc: any) => oc.doNothing())
    .execute()

  return job
}
