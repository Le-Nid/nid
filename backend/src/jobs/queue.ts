import { randomUUID } from 'node:crypto'
import { Queue, Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { getDb } from '../db'
import { config } from '../config'

export type JobType =
  | 'bulk_operation'
  | 'archive_mails'
  | 'run_rule'
  | 'scan_unsubscribe'
  | 'integrity_check'
  | 'scan_tracking'
  | 'scan_pii'
  | 'encrypt_archives'
  | 'import_mbox'
  | 'import_imap'
  | 'apply_retention'
  | 'purge_archive_trash'
  | 'backfill_body_text'

export interface JobPayload {
  accountId: string
  userId?: string
  [key: string]: unknown
}

let _queue: Queue | null = null

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('nid', {
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

/** Copy of the payload without credentials, for the `jobs` table (readable via /api/jobs and admin). */
function redactSecrets(payload: JobPayload): JobPayload {
  const { passphrase, imapConfig, ...rest } = payload as JobPayload & { imapConfig?: Record<string, unknown> }
  if (imapConfig) {
    const { pass, ...imapRest } = imapConfig
    return { ...rest, imapConfig: imapRest }
  }
  return rest
}

/**
 * `dedupId`: while a job with this id is waiting or running, enqueueing it again is a no-op.
 * `delay` (ms): the job stays 'scheduled' (BullMQ 'delayed') until then, so it can still be cancelled (undo, D1).
 */
export async function enqueueJob(type: JobType, payload: JobPayload, opts: { dedupId?: string; delay?: number } = {}) {
  const queue = getQueue()
  const jobId = `${type}-${randomUUID()}`
  const redacted = redactSecrets(payload)
  const hasSecrets = JSON.stringify(redacted) !== JSON.stringify(payload)
  const job = await queue.add(type, payload, {
    jobId,
    // shortcut: credentials still sit in Redis while the job waits/runs; drop them as soon as it ends
    ...(hasSecrets ? { removeOnComplete: true, removeOnFail: true } : {}),
    ...(opts.dedupId ? { deduplication: { id: opts.dedupId } } : {}),
    ...(opts.delay ? { delay: opts.delay } : {}),
  })
  // Pre-insert job row so SSE can find it immediately (skipped when BullMQ deduplicated: the row already exists)
  if (job.id === jobId) {
    await getDb()
      .insertInto('jobs')
      .values({
        bullmq_id: String(job.id),
        type,
        status: opts.delay ? 'scheduled' : 'pending',
        progress: 0,
        processed: 0,
        total: 0,
        gmail_account_id: payload.accountId || null, // '' = job not tied to an account
        user_id: payload.userId ?? null,
        payload: JSON.stringify(redacted),
      })
      .onConflict((oc: any) => oc.doNothing())
      .execute()
  }

  return job
}
