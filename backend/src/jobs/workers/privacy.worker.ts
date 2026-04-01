import { Worker, Job } from 'bullmq'
import { getRedis } from '../../plugins/redis'
import { getDb } from '../../db'
import { notify } from '../../notifications/notify'
import { scanTrackingPixels } from '../../privacy/tracking.service'
import { scanArchivePii } from '../../privacy/pii.service'
import { encryptArchives } from '../../privacy/encryption.service'

interface PrivacyPayload {
  accountId: string
  userId?: string
  action: 'scan_tracking' | 'scan_pii' | 'encrypt_archives'
  passphrase?: string
  maxMessages?: number
}

export function startPrivacyWorker() {
  const worker = new Worker<PrivacyPayload>(
    'gmail-manager',
    async (job: Job<PrivacyPayload>) => {
      if (
        job.name !== 'scan_tracking' &&
        job.name !== 'scan_pii' &&
        job.name !== 'encrypt_archives'
      ) return

      const { accountId, userId, action } = job.data
      const db = getDb()

      // Insert job row
      await db
        .insertInto('jobs')
        .values({
          bullmq_id: String(job.id),
          type: action,
          status: 'active',
          total: 0,
          gmail_account_id: accountId || null,
          user_id: userId ?? null,
          payload: JSON.stringify({ accountId, action }),
        })
        .onConflict((oc: any) => oc.doNothing())
        .execute()

      try {
        if (action === 'scan_tracking') {
          const result = await scanTrackingPixels(accountId, {
            maxMessages: job.data.maxMessages ?? 200,
            onProgress: async (done, total) => {
              const progress = Math.round((done / total) * 100)
              await job.updateProgress(progress)
              if (done % 20 === 0) {
                await db.updateTable('jobs')
                  .set({ progress, processed: done, total })
                  .where('bullmq_id', '=', String(job.id))
                  .execute()
              }
            },
          })

          await db.updateTable('jobs')
            .set({ status: 'completed', progress: 100, processed: result.scanned, total: result.scanned, completed_at: new Date() })
            .where('bullmq_id', '=', String(job.id))
            .execute()

          if (userId) {
            await notify({
              userId,
              category: 'job_completed',
              title: 'Scan tracking terminé',
              body: `${result.scanned} message(s) analysé(s), ${result.tracked} contenant des trackers.`,
              data: { jobId: String(job.id), ...result },
            })
          }
        } else if (action === 'scan_pii') {
          const result = await scanArchivePii(accountId, {
            onProgress: async (done, total) => {
              const progress = Math.round((done / total) * 100)
              await job.updateProgress(progress)
              if (done % 20 === 0) {
                await db.updateTable('jobs')
                  .set({ progress, processed: done, total })
                  .where('bullmq_id', '=', String(job.id))
                  .execute()
              }
            },
          })

          await db.updateTable('jobs')
            .set({ status: 'completed', progress: 100, processed: result.scanned, total: result.scanned, completed_at: new Date() })
            .where('bullmq_id', '=', String(job.id))
            .execute()

          if (userId) {
            await notify({
              userId,
              category: result.withPii > 0 ? 'integrity_alert' : 'job_completed',
              title: 'Scan PII terminé',
              body: `${result.scanned} archive(s) analysée(s), ${result.withPii} avec données sensibles.`,
              data: { jobId: String(job.id), ...result },
            })
          }
        } else if (action === 'encrypt_archives') {
          const passphrase = job.data.passphrase
          if (!passphrase) throw new Error('Passphrase required for encryption')

          const result = await encryptArchives(accountId, passphrase, {
            onProgress: async (done, total) => {
              const progress = Math.round((done / total) * 100)
              await job.updateProgress(progress)
              if (done % 10 === 0) {
                await db.updateTable('jobs')
                  .set({ progress, processed: done, total })
                  .where('bullmq_id', '=', String(job.id))
                  .execute()
              }
            },
          })

          await db.updateTable('jobs')
            .set({ status: 'completed', progress: 100, processed: result.encrypted, total: result.encrypted + result.errors, completed_at: new Date() })
            .where('bullmq_id', '=', String(job.id))
            .execute()

          if (userId) {
            await notify({
              userId,
              category: 'job_completed',
              title: 'Chiffrement terminé',
              body: `${result.encrypted} archive(s) chiffrée(s)${result.errors > 0 ? `, ${result.errors} erreur(s)` : ''}.`,
              data: { jobId: String(job.id), ...result },
            })
          }
        }
      } catch (err) {
        await db.updateTable('jobs')
          .set({ status: 'failed', error: (err as Error).message, completed_at: new Date() })
          .where('bullmq_id', '=', String(job.id))
          .execute()

        if (userId) {
          await notify({
            userId,
            category: 'job_failed',
            title: `Échec ${action}`,
            body: (err as Error).message,
            data: { jobId: String(job.id) },
          })
        }
        throw err
      }
    },
    { connection: getRedis(), concurrency: 1 },
  )
  return worker
}
