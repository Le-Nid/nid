import { Worker, Job } from 'bullmq'
import { getRedis } from '../plugins/redis'
import { getDb } from '../plugins/db'
import { archiveMail, getArchivedIds } from '../archive/archive.service'
import { listMessages } from '../gmail/gmail.service'
import { config } from '../config'

interface ArchivePayload {
  accountId: string
  messageIds?: string[]   // if provided, archive these specific IDs
  query?: string          // if provided, query Gmail and archive results
  differential?: boolean  // skip already archived mails
}

export function startArchiveWorker() {
  const worker = new Worker<ArchivePayload>(
    'gmail-manager',
    async (job: Job<ArchivePayload>) => {
      if (job.name !== 'archive_mails') return
      const { accountId, messageIds, query, differential = true } = job.data
      const db = getDb()

      let ids: string[] = messageIds ?? []

      // If query provided, fetch all matching IDs from Gmail
      if (!ids.length && query) {
        let pageToken: string | null = null
        do {
          const res = await listMessages(accountId, { query, maxResults: 500, pageToken: pageToken ?? undefined })
          ids.push(...res.messages.map((m: any) => m.id))
          pageToken = res.nextPageToken
        } while (pageToken)
      }

      // Differential: remove already archived IDs
      if (differential) {
        const archived = await getArchivedIds(accountId)
        ids = ids.filter((id) => !archived.has(id))
      }

      const total = ids.length

      await db`
        INSERT INTO jobs (bullmq_id, type, status, total, gmail_account_id, payload)
        VALUES (${job.id}, 'archive_mails', 'active', ${total}, ${accountId}, ${JSON.stringify(job.data)})
        ON CONFLICT DO NOTHING
      `

      let processed = 0
      for (const messageId of ids) {
        try {
          await archiveMail(accountId, messageId)
        } catch (err) {
          console.error(`Failed to archive ${messageId}:`, err)
          // Non-fatal: continue with next mail
        }
        processed++
        const progress = Math.round((processed / total) * 100)
        await job.updateProgress(progress)

        if (processed % 10 === 0) {
          await db`
            UPDATE jobs SET progress = ${progress}, processed = ${processed}
            WHERE bullmq_id = ${job.id}
          `
        }
      }

      await db`
        UPDATE jobs SET status = 'completed', progress = 100, processed = ${total}, completed_at = NOW()
        WHERE bullmq_id = ${job.id}
      `
    },
    { connection: getRedis(), concurrency: 1 } // archive is I/O heavy, 1 at a time
  )

  return worker
}
