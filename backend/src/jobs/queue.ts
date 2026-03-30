import { Queue, Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { config } from '../config'

export type JobType =
  | 'bulk_operation'
  | 'archive_mails'
  | 'run_rule'
  | 'sync_dashboard'

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
  return job
}
