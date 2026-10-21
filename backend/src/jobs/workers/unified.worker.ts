import { Worker, Job } from 'bullmq'
import { getRedis } from '../../plugins/redis'
import { getDb } from '../../db'
import { notify } from '../../notifications/notify'
import { archiveMail, getArchivedIds } from '../../archive/archive.service'
import { listMessages, trashMessages, modifyMessages } from '../../gmail/gmail.service'
import { getRule, runRule } from '../../rules/rules.service'
import { scanNewsletters, saveNewsletterScan, forgetNewsletterSender } from '../../unsubscribe/unsubscribe.service'
import { scanTrackingPixels } from '../../privacy/tracking.service'
import { scanArchivePii } from '../../privacy/pii.service'
import { encryptArchives } from '../../privacy/encryption.service'
import { importMbox, importImap } from '../../archive/import.service'
import { applyRetentionPolicies } from '../../archive/retention.service'
import { purgeArchiveTrash } from '../../archive/trash.service'
import { checkArchiveIntegrity } from '../../archive/integrity.service'
import { backfillBodyText, countPendingBodyText } from '../../archive/body-text'
import { createLogger } from '../../logger'
import { config } from '../../config'
import { logAudit, type AuditAction } from '../../audit/audit.service'
import { publishUserEvents } from '../../events/events.service'
import { enqueueJob } from '../queue'

const logger = createLogger('worker')

export function startUnifiedWorker() {
  const worker = new Worker(
    'nid',
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
        case 'purge_archive_trash':
          return handlePurgeTrash(job)
        case 'integrity_check':
          return handleIntegrity(job)
        case 'backfill_body_text':
          return handleBackfillBodyText(job)
        default:
          // Fail loudly: a silent no-op left the job row pending forever
          throw new Error(`Unknown job type: ${job.name}`)
      }
    },
    { connection: getRedis(), concurrency: 3 },
  )

  worker.on('failed', (job, err) =>
    logger.error({ jobName: job?.name, jobId: job?.id, err: err.message }, 'Job failed'),
  )

  // B3: one central hook for every job type instead of each handler
  worker.on('active', (job) => publishJobEvent(job, 'started'))
  worker.on('completed', (job) => publishJobEvent(job, 'finished'))
  worker.on('failed', (job) => job && publishJobEvent(job, 'finished'))

  return worker
}

function publishJobEvent(job: Job, phase: 'started' | 'finished') {
  const { userId, accountId } = job.data ?? {}
  if (!userId) return
  publishUserEvents(userId, {
    event: 'job',
    data: { jobId: String(job.id), type: job.name, accountId: accountId || null, phase, failed: !!job.failedReason },
  }).catch((err) => logger.warn({ err, jobId: job.id }, 'publish job event failed'))
}

// ─── Archive ────────────────────────────────────────────────
async function listAllMessageIds(accountId: string, query?: string): Promise<string[]> {
  const ids: string[] = []
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
  return ids
}

async function handleArchive(job: Job) {
  const { accountId, messageIds, query, differential = true, userId, chain = 0 } = job.data
  const db = getDb()

  try {
    const byQuery = !messageIds?.length && !!query
    let ids: string[] = messageIds?.length ? messageIds : await listAllMessageIds(accountId, query)

    if (differential) {
      const archived = await getArchivedIds(accountId)
      ids = ids.filter((id) => !archived.has(id))
    }

    // Same cap as bulk-by-query; the rest is picked up by a differential continuation (see below)
    const capped = byQuery && ids.length > config.BULK_QUERY_MAX
    if (capped) ids = ids.slice(0, config.BULK_QUERY_MAX)

    const total = ids.length

    await db
      .updateTable('jobs')
      .set({ status: 'active', total })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    let processed = 0
    let failed = 0
    for (const messageId of ids) {
      try {
        await archiveMail(accountId, messageId)
      } catch (err) {
        failed++
        logger.error({ messageId, err }, 'Failed to archive message')
      }
      processed++
      const progress = Math.round((processed / total) * 100)

      if (processed % 10 === 0 || processed === total) {
        await db
          .updateTable('jobs')
          .set({ progress, processed })
          .where('bullmq_id', '=', String(job.id))
          .execute()
      }
      await job.updateProgress(progress)
    }

    // Every message failing means a systemic problem (token, disk…), not a bad mail
    const allFailed = total > 0 && failed === total
    await db
      .updateTable('jobs')
      .set({
        status: allFailed ? 'failed' : 'completed',
        progress: 100,
        processed: total,
        completed_at: new Date(),
        ...(failed ? { error: `${failed}/${total} message(s) failed to archive` } : {}),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    const archivedCount = total - failed
    // Chain stops when a run saved nothing new (it would loop on the same failures) or after ARCHIVE_CHAIN_MAX runs
    const continues = capped && archivedCount > 0 && chain < config.ARCHIVE_CHAIN_MAX
    let continuationId: string | undefined
    if (continues) {
      const next = await enqueueJob(
        'archive_mails',
        { accountId, userId, query, differential: true, chain: chain + 1 },
        { delay: config.ARCHIVE_CONTINUE_DELAY_MIN * 60_000 },
      )
      continuationId = String(next.id)
    }

    if (userId) {
      const failedNote = failed ? `, ${failed} en échec` : ''
      const delay = config.ARCHIVE_CONTINUE_DELAY_MIN
      await notify({
        userId,
        category: allFailed ? 'job_failed' : 'job_completed',
        ...(continues
          ? { title: 'Sauvegarde partielle', body: `Sauvegarde partielle : ${archivedCount} mails sauvegardés${failedNote}, la suite reprend automatiquement dans ${delay} min.` }
          : capped
            ? { title: 'Sauvegarde partielle', body: `Sauvegarde partielle : ${archivedCount} mails sauvegardés${failedNote}. Plafond atteint et reprise automatique arrêtée : relancez la sauvegarde pour la suite.` }
            : { title: allFailed ? 'Archivage échoué' : 'Archivage terminé', body: `${archivedCount} mail(s) archivé(s) sur le NAS${failedNote}.` }),
        data: {
          jobId: String(job.id), count: archivedCount, failed,
          ...(capped ? { capped: true, query, continuationJobId: continuationId ?? null } : {}),
        },
      })
    }
  } catch (err) {
    await db
      .updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()
    throw err
  }
}

// ─── Bulk ───────────────────────────────────────────────────
const BULK_CHUNK_SIZE = 50

/** Pages of ids to process: slices of messageIds, or Gmail search pages (B5 select-all by query). */
async function* bulkPages(accountId: string, messageIds: string[] | undefined, query: string | undefined) {
  if (!query) {
    const ids = messageIds ?? []
    for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
      yield { ids: ids.slice(i, i + BULK_CHUNK_SIZE), estimate: ids.length, more: i + BULK_CHUNK_SIZE < ids.length }
    }
    return
  }
  let pageToken: string | undefined
  do {
    const res = await listMessages(accountId, { query, maxResults: 500, pageToken })
    pageToken = res.nextPageToken ?? undefined
    yield { ids: res.messages.map((m) => m.id!), estimate: res.resultSizeEstimate, more: !!pageToken }
  } while (pageToken)
}

async function applyBulkAction(accountId: string, action: string, labelId: string | undefined, ids: string[]) {
  switch (action) {
    case 'trash':
    // shortcut: the gmail.modify scope cannot delete permanently; Gmail empties its trash after 30 days
    case 'delete':
      // batchModify adding TRASH is not a documented way to trash: keep messages.trash
      return trashMessages(accountId, ids)
    case 'archive':
      return modifyMessages(accountId, ids, [], ['INBOX'])
    case 'mark_read':
      return modifyMessages(accountId, ids, [], ['UNREAD'])
    case 'mark_unread':
      return modifyMessages(accountId, ids, ['UNREAD'], [])
    case 'label':
      if (!labelId) throw new Error('labelId required')
      return modifyMessages(accountId, ids, [labelId], [])
    case 'unlabel':
      if (!labelId) throw new Error('labelId required')
      return modifyMessages(accountId, ids, [], [labelId])
    default:
      throw new Error(`Unknown bulk action: ${action}`)
  }
}

async function handleBulk(job: Job) {
  const { accountId, action, messageIds, labelId, query, userId, senderEmail } = job.data
  const db = getDb()
  const jobRow = () => db.updateTable('jobs').where('bullmq_id', '=', String(job.id))
  const cap = query ? config.BULK_QUERY_MAX : Infinity
  const state = { processed: 0, capped: false, estimate: 0 }

  await jobRow().set({ status: 'active', total: messageIds?.length ?? 0 }).execute()

  try {
    let seen = 0
    for await (const page of bulkPages(accountId, messageIds, query)) {
      const ids = page.ids.slice(0, cap - state.processed)
      seen += page.ids.length
      state.estimate = Math.max(seen, page.estimate ?? 0)
      if (ids.length) await applyBulkAction(accountId, action, labelId, ids)
      state.processed += ids.length
      // Query mode discovers the total page by page; Gmail's estimate keeps the bar honest meanwhile
      const total = Math.min(cap, page.more ? Math.max(seen, page.estimate) : seen)
      const progress = total ? Math.round((state.processed / total) * 100) : 100
      await jobRow().set({ progress, processed: state.processed, total }).execute()
      await job.updateProgress(progress)
      if (state.processed >= cap) {
        state.capped = seen > state.processed || page.more
        break
      }
    }
    const capNote = state.capped ? `Plafond de ${cap} mail(s) atteint : les résultats suivants n'ont pas été traités.` : ''
    await jobRow()
      .set({
        status: 'completed', progress: 100, processed: state.processed, total: state.processed,
        completed_at: new Date(), ...(capNote ? { error: capNote } : {}),
      })
      .execute()
    // Cleanup « Tout supprimer »: the sender's mails are gone, keep the cached scan in step
    if (senderEmail) await forgetNewsletterSender(accountId, senderEmail)

    if (userId && state.capped) {
      // No auto-relaunch: label/mark actions keep matching the query and would loop. The UI offers "Relancer" (B11).
      const remainingEstimate = Math.max(state.estimate - state.processed, 0)
      await notify({
        userId,
        category: 'job_completed',
        title: 'Plafond atteint',
        body: `${state.processed} mails traités sur ~${Math.max(state.estimate, state.processed)} — relancez l'action pour traiter la suite.`,
        data: { capped: true, jobId: String(job.id), query, action, labelId: labelId ?? null, processed: state.processed, remainingEstimate },
      })
    } else if (userId) {
      await notify({
        userId,
        category: 'job_completed',
        title: 'Opération bulk terminée',
        body: `${state.processed} élément(s) traité(s) (${action}).`,
        data: { jobId: String(job.id), action, count: state.processed, capped: false },
      })
    }
  } catch (err) {
    await jobRow().set({ status: 'failed', error: String(err) }).execute()

    if (userId) {
      await notify({
        userId,
        category: 'job_failed',
        title: 'Opération bulk échouée',
        body: String(err),
        data: { jobId: String(job.id), action },
      })
    }
    throw err
  } finally {
    // The route cannot know how many mails a query matches: audit the real count once the job ends
    if (query && userId) {
      const auditAction = action === 'trash' || action === 'archive' ? `bulk.${action}` : 'bulk.label'
      await logAudit(userId, auditAction as AuditAction, {
        targetType: 'messages', targetId: accountId,
        details: { action, query, count: state.processed, capped: state.capped, jobId: String(job.id) },
      })
    }
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

    const result = await runRule(rule, accountId, job.data.userId)

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
    await saveNewsletterScan(accountId, newsletters)

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

// ─── Purge archive trash ────────────────────────────────────
async function handlePurgeTrash(job: Job) {
  const db = getDb()

  await db
    .updateTable('jobs')
    .set({ status: 'active' })
    .where('bullmq_id', '=', String(job.id))
    .execute()

  try {
    const result = await purgeArchiveTrash()

    await db.updateTable('jobs')
      .set({
        status: 'completed',
        progress: 100,
        processed: result.deleted,
        total: result.deleted,
        completed_at: new Date(),
      })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (result.deleted > 0) {
      logger.info(`Purge archive trash: ${result.deleted} mail(s) permanently deleted`)
    }

    return result
  } catch (err) {
    await db.updateTable('jobs')
      .set({ status: 'failed', error: String(err) })
      .where('bullmq_id', '=', String(job.id))
      .execute()
    throw err
  }
}

// ─── Integrity check ────────────────────────────────────────
async function handleIntegrity(job: Job) {
  const db = getDb()
  await db.updateTable('jobs').set({ status: 'active' }).where('bullmq_id', '=', String(job.id)).execute()

  try {
    const result = await checkArchiveIntegrity(job.data.accountId || undefined)
    await db.updateTable('jobs')
      .set({ status: 'completed', progress: 100, processed: result.checkedFiles, total: result.totalRecords, completed_at: new Date() })
      .where('bullmq_id', '=', String(job.id))
      .execute()

    if (!result.healthy) {
      const admins = await db.selectFrom('users').select('id').where('role', '=', 'admin').execute()
      const body = `${result.missingFiles.length} fichier(s) manquant(s), ${result.corruptedFiles.length} corrompu(s), ${result.orphanedFiles.length} orphelin(s).`
      await Promise.all(admins.map(({ id }) =>
        notify({ userId: id, category: 'integrity_alert', title: 'Intégrité des archives', body, data: { jobId: String(job.id) } }),
      ))
    }
    return result
  } catch (err) {
    await db.updateTable('jobs').set({ status: 'failed', error: String(err) }).where('bullmq_id', '=', String(job.id)).execute()
    throw err
  }
}

// ─── Backfill body_text (B2) ────────────────────────────────
async function handleBackfillBodyText(job: Job) {
  const db = getDb()
  const setJob = (values: Record<string, unknown>) =>
    db.updateTable('jobs').set(values).where('bullmq_id', '=', String(job.id)).execute()

  const total = await countPendingBodyText()
  await setJob({ status: 'active', total })
  try {
    const processed = await backfillBodyText((done) =>
      setJob({ processed: done, progress: total ? Math.min(99, Math.round((done / total) * 100)) : 0 }).then(() => undefined),
    )
    await setJob({ status: 'completed', progress: 100, processed, completed_at: new Date() })
    return { processed }
  } catch (err) {
    await setJob({ status: 'failed', error: String(err) })
    throw err
  }
}
