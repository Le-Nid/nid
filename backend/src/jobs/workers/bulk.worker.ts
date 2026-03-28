import { Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { getDb } from '../plugins/db'
import {
  trashMessages,
  deleteMessages,
  modifyMessages,
} from '../gmail/gmail.service'

interface BulkPayload {
  accountId: string
  action: 'trash' | 'delete' | 'label' | 'unlabel' | 'mark_read' | 'mark_unread' | 'archive'
  messageIds: string[]
  labelId?: string
}

export function startBulkWorker() {
  const worker = new Worker<BulkPayload>(
    'gmail-manager',
    async (job: Job<BulkPayload>) => {
      if (job.name !== 'bulk_operation') return
      const { accountId, action, messageIds, labelId } = job.data
      const db = getDb()
      const total = messageIds.length

      // Track job in DB
      await db`
        INSERT INTO jobs (bullmq_id, type, status, total, gmail_account_id, payload)
        VALUES (${job.id}, 'bulk_operation', 'active', ${total}, ${accountId}, ${JSON.stringify(job.data)})
        ON CONFLICT DO NOTHING
      `

      const updateProgress = async (processed: number) => {
        const progress = Math.round((processed / total) * 100)
        await job.updateProgress(progress)
        await db`
          UPDATE jobs SET progress = ${progress}, processed = ${processed}
          WHERE bullmq_id = ${job.id}
        `
      }

      try {
        switch (action) {
          case 'trash':
            await trashMessages(accountId, messageIds)
            break
          case 'delete':
            await deleteMessages(accountId, messageIds)
            break
          case 'archive':
            await modifyMessages(accountId, messageIds, [], ['INBOX'])
            break
          case 'mark_read':
            await modifyMessages(accountId, messageIds, [], ['UNREAD'])
            break
          case 'mark_unread':
            await modifyMessages(accountId, messageIds, ['UNREAD'], [])
            break
          case 'label':
            if (!labelId) throw new Error('labelId required for label action')
            await modifyMessages(accountId, messageIds, [labelId], [])
            break
          case 'unlabel':
            if (!labelId) throw new Error('labelId required for unlabel action')
            await modifyMessages(accountId, messageIds, [], [labelId])
            break
        }

        await updateProgress(total)
        await db`
          UPDATE jobs SET status = 'completed', completed_at = NOW()
          WHERE bullmq_id = ${job.id}
        `
      } catch (err) {
        await db`
          UPDATE jobs SET status = 'failed', error = ${String(err)}
          WHERE bullmq_id = ${job.id}
        `
        throw err
      }
    },
    { connection: getRedis(), concurrency: 3 }
  )

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message)
  })

  return worker
}
