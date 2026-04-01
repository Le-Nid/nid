import { Worker, Job } from 'bullmq'
import { getRedis } from '../../plugins/redis'
import { getDb } from '../../db'
import { notify } from '../../notifications/notify'
import { archiveMail, getArchivedIds } from '../../archive/archive.service'
import { listMessages, trashMessages, deleteMessages, modifyMessages } from '../../gmail/gmail.service'
import { getRule, runRule } from '../../rules/rules.service'
import { scanNewsletters } from '../../unsubscribe/unsubscribe.service'
import { scanTrackingPixels } from '../../privacy/tracking.service'
import { scanArchivePii } from '../../privacy/pii.service'
import { encryptArchives } from '../../privacy/encryption.service'
import { importMbox, importImap } from '../../archive/import.service'
import { applyRetentionPolicies } from '../../archive/retention.service'

export function startUnifiedWorker() {
  const worker = new Worker(
    'gmail-manager',
    async (job: Job) => {
      switch (job.name) {
        case 'archive_mails':
          return handleArchive(job)
        case 'bulk_operation':
          return handleBulk(job)
        case 'run_rule':
          return handleRule(job)
        case 'scan_unsubscribe':
          return handleUnsubscribe(job)
        case 'scan_tracking':
        case 'scan_pii':
        case 'encrypt_archives':
          return handlePrivacy(job)
        case 'import_mbox':
          return handleImportMbox(job)
        case 'import_imap':
          return handleImportImap(job)
        case 'apply_retention':
          return handleRetention(job)
        default:
          console.warn(`Unknown job type: ${job.name}`)
      }
    },
    { connection: getRedis(), concurrency: 3 },
  )

  worker.on('failed', (job, err) =>
    console.error(`Job ${job?.name}/${job?.id} failed:`, err.message),
  )

  return worker
}

// ─── Archive ────────────────────────────────────────────────
async function handleArchive(job: Job) {
  const { accountId, messageIds, query, differential = true } = job.data
  const db = getDb()

  let ids: string[] = messageIds ?? []

  if (!ids.length) {
    let pageToken: string | null = null
    do {
      const res: any = await listMessages(accountId, {
        query: query || undefined,
        maxResults: 500,
        pageToken: pageToken ?? undefined,
      })
      ids.push(...(res.messages ?? []).map((m: any) => m.id))
      pageToken = res.nextPageToken
    } while (pageToken)
  }

  if (differential) {
    const archived = await getArchivedIds(accountId)
    ids = ids.filter((id) => !archived.has(id))
  }

  const total = ids.length

  await db
    .updateTable('jobs')
    .set({ status: 'active', total })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  let processed = 0
  for (const messageId of ids) {
    try {
      await archiveMail(accountId, messageId)
    } catch (err) {
      console.error(`Failed to archive ${messageId}:`, err)
    }
    processed++
    const progress = Math.round((processed / total) * 100)
    await job.updateProgress(progress)

    if (processed % 10 === 0) {
      await db
        .updateTable('jobs')
        .set({ progress, processed })
        .where('bullmq_id', '=', String(job.id))
        .execute()
    }
  }

  await db
    .updateTable('jobs')
    .set({ status: 'completed', progress: 100, processed: total, completed_at: new Date() })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  if (job.data.userId) {
    await notify({
      userId: job.data.userId,
      category: 'job_completed',
      title: 'Archivage terminé',
      body: `${total} mail(s) archivé(s) sur le NAS.`,
      data: { jobId: String(job.id), count: total },
    })
  }
}

// ─── Bulk ───────────────────────────────────────────────────
async function handleBulk(job: Job) {
  const { accountId, action, messageIds, labelId } = job.data
  const db = getDb()
  const total = messageIds.length

  await db
    .updateTable('jobs')
    .set({ status: 'active', total })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  const updateProgress = async (processed: number) => {
    const progress = Math.round((processed / total) * 100)
    await job.updateProgress(progress)
    await db
      .updateTable('jobs')
      .set({ progress, processed })
      .where('bullmq_id', '=', String(job.id))
      .execute()
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
        if (!labelId) throw new Error('labelId required')
        await modifyMessages(accountId, messageIds, [labelId], [])
        break
      case 'unlabel':
        if (!labelId) throw new Error('labelId required')
        await modifyMessages(accountId, messageIds, [], [labelId])
        break
    }
    await updateProgress(total)
    await db
      .updateTable('jobs')
      .set({ status: 'completed', completed_at: new Date() })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (job.data.userId) {
      await notify({
        userId: job.data.userId,
        category: 'job_completed',
        title: 'Opération bulk terminée',
        body: `${total} élément(s) traité(s) (${action}).`,
        data: { jobId: String(job.id), action, count: total },
      })
    }
  } catch (err) {
    await db
      .updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (job.data.userId) {
      await notify({
        userId: job.data.userId,
        category: 'job_failed',
        title: 'Opération bulk échouée',
        body: String(err),
        data: { jobId: String(job.id), action },
      })
    }
    throw err
  }
}

// ─── Rule ───────────────────────────────────────────────────
async function handleRule(job: Job) {
  const { accountId, ruleId } = job.data
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    const rule = await getRule(ruleId, accountId)
    if (!rule) throw new Error(`Rule ${ruleId} not found`)
    if (!rule.is_active) throw new Error(`Rule ${ruleId} is disabled`)

    const result = await runRule(rule, accountId)

    await db
      .updateTable('jobs')
      .set({
        status: 'completed',
        progress: 100,
        completed_at: new Date(),
        payload: JSON.stringify({ ...job.data, result }),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (job.data.userId) {
      await notify({
        userId: job.data.userId,
        category: 'rule_executed',
        title: `Règle "${rule.name}" exécutée`,
        body: `${result?.processed ?? 0} mail(s) traité(s).`,
        data: { jobId: String(job.id), ruleId, ruleName: rule.name },
      })
    }

    return result
  } catch (err) {
    await db
      .updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (job.data.userId) {
      await notify({
        userId: job.data.userId,
        category: 'job_failed',
        title: 'Règle échouée',
        body: String(err),
        data: { jobId: String(job.id), ruleId },
      })
    }
    throw err
  }
}

// ─── Unsubscribe ────────────────────────────────────────────
async function handleUnsubscribe(job: Job) {
  const { accountId } = job.data
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
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
}

// ─── Privacy ────────────────────────────────────────────────
async function handlePrivacy(job: Job) {
  const { accountId, userId, action } = job.data as {
    accountId: string
    userId?: string
    action: 'scan_tracking' | 'scan_pii' | 'encrypt_archives'
  }
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    if (action === 'scan_tracking') {
      const result = await scanTrackingPixels(accountId, {
        maxMessages: job.data.maxMessages ?? 200,
        onProgress: async (done: number, total: number) => {
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
        onProgress: async (done: number, total: number) => {
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
          title: 'Scan PII terminé',
          body: `${result.scanned} archive(s) analysée(s), ${result.withPii} contenant des données sensibles.`,
          data: { jobId: String(job.id), ...result },
        })
      }
    } else if (action === 'encrypt_archives') {
      const passphrase = job.data.passphrase
      if (!passphrase) throw new Error('Passphrase required')

      const result = await encryptArchives(accountId, passphrase, {
        onProgress: async (done: number, total: number) => {
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
        .set({ status: 'completed', progress: 100, processed: result.encrypted, total: result.encrypted, completed_at: new Date() })
        .where('bullmq_id', '=', String(job.id))
        .execute()

      if (userId) {
        await notify({
          userId,
          category: 'job_completed',
          title: 'Chiffrement terminé',
          body: `${result.encrypted} archive(s) chiffrée(s).`,
          data: { jobId: String(job.id), ...result },
        })
      }
    }
  } catch (err) {
    await db.updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_failed',
        title: `${action} échoué`,
        body: String(err),
        data: { jobId: String(job.id) },
      })
    }
    throw err
  }
}

// ─── Import mbox ────────────────────────────────────────────
async function handleImportMbox(job: Job) {
  const { accountId, userId, filePath } = job.data
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    const result = await importMbox(userId, accountId, filePath, {
      onProgress: async (done: number, total: number) => {
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
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
      .set({
        status: 'completed',
        progress: 100,
        processed: result.imported + result.skipped,
        total: result.imported + result.skipped + result.errors,
        completed_at: new Date(),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    // Cleanup temp file
    try {
      const fs = await import('fs/promises')
      await fs.unlink(filePath)
    } catch { /* ignore */ }

    if (userId) {
      await notify({
        userId,
        category: 'job_completed',
        title: 'Import mbox terminé',
        body: `${result.imported} importé(s), ${result.skipped} ignoré(s), ${result.errors} erreur(s).`,
        data: { jobId: String(job.id), ...result },
      })
    }

    return result
  } catch (err) {
    await db.updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_failed',
        title: 'Import mbox échoué',
        body: String(err),
        data: { jobId: String(job.id) },
      })
    }
    throw err
  }
}

// ─── Import IMAP ────────────────────────────────────────────
async function handleImportImap(job: Job) {
  const { accountId, userId, imapConfig } = job.data
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    const result = await importImap(userId, accountId, imapConfig, {
      onProgress: async (done: number, total: number) => {
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
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
      .set({
        status: 'completed',
        progress: 100,
        processed: result.imported + result.skipped,
        total: result.imported + result.skipped + result.errors,
        completed_at: new Date(),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_completed',
        title: 'Import IMAP terminé',
        body: `${result.imported} importé(s), ${result.skipped} ignoré(s), ${result.errors} erreur(s).`,
        data: { jobId: String(job.id), ...result },
      })
    }

    return result
  } catch (err) {
    await db.updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_failed',
        title: 'Import IMAP échoué',
        body: String(err),
        data: { jobId: String(job.id) },
      })
    }
    throw err
  }
}

// ─── Retention ──────────────────────────────────────────────
async function handleRetention(job: Job) {
  const { userId } = job.data
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    const result = await applyRetentionPolicies()

    await db.updateTable('jobs')
      .set({
        status: 'completed',
        progress: 100,
        processed: result.totalDeleted,
        total: result.policiesRun,
        completed_at: new Date(),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_completed',
        title: 'Rétention appliquée',
        body: `${result.policiesRun} politique(s) exécutée(s), ${result.totalDeleted} archive(s) supprimée(s).`,
        data: { jobId: String(job.id), ...result },
      })
    }

    return result
  } catch (err) {
    await db.updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_failed',
        title: 'Rétention échouée',
        body: String(err),
        data: { jobId: String(job.id) },
      })
    }
    throw err
  }
}
