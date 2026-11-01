import { Worker, Job } from 'bullmq'
import { getRedis } from '../../plugins/redis'
import { getDb } from '../../db'
import { notify } from '../../notifications/notify'
import { archiveMail, getArchivedIds } from '../../archive/archive.service'
import { listMessages, trashMessages, modifyMessages } from '../../gmail/gmail.service'
import { getRule, runRule } from '../../rules/rules.service'
import { scanNewsletters, saveNewsletterScan, forgetNewsletterSender } from '../../unsubscribe/unsubscribe.service'
import { decryptArchives } from '../../privacy/encryption.service'
import { importMbox, importImap } from '../../archive/import.service'
import { isImapAuthError, syncImapAccount } from '../../imap/imap.service'
import { flagReauthRequired } from '../../auth/oauth.service'
import { applyRetentionPolicies } from '../../archive/retention.service'
import { purgeArchiveTrash } from '../../archive/trash.service'
import { checkArchiveIntegrity, saveIntegrityResult } from '../../archive/integrity.service'
import { backfillBodyText, countPendingBodyText } from '../../archive/body-text'
import { restoreToGmail, restoreToImap } from '../../archive/restore.service'
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
        case 'decrypt_archives':
          return handleDecryptArchives(job)
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
        case 'restore_gmail':
          return handleRestoreGmail(job)
        case 'restore_imap':
          return handleRestoreImap(job)
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

/** BullMQ retries a failed job (attempts: 3): notify the failure once, when the last attempt fails. */
function isLastAttempt(job: Job): boolean {
  return (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1)
}

/** Marks the job row failed and, on its last attempt only, notifies the owner (bell + webhooks). The caller rethrows. */
async function recordJobFailure(job: Job, userId: string | undefined, title: string, err: unknown, data: Record<string, unknown> = {}) {
  await getDb().updateTable('jobs').set({ status: 'failed', error: String(err) }).where('bullmq_id', '=', String(job.id)).execute()
  if (userId && isLastAttempt(job)) {
    await notify({ userId, category: 'job_failed', title, body: String(err), data: { jobId: String(job.id), ...data } })
  }
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

/** Ids still to archive (a query lists Gmail; differential skips the archived ones), capped like bulk-by-query. */
async function idsToArchive(accountId: string, messageIds: string[] | undefined, query: string | undefined, differential: boolean) {
  const byQuery = !messageIds?.length && !!query
  let ids: string[] = messageIds?.length ? messageIds : await listAllMessageIds(accountId, query)
  if (differential) {
    const archived = await getArchivedIds(accountId)
    ids = ids.filter((id) => !archived.has(id))
  }
  // The rest is picked up by a differential continuation (see handleArchive)
  const capped = byQuery && ids.length > config.BULK_QUERY_MAX
  return { ids: capped ? ids.slice(0, config.BULK_QUERY_MAX) : ids, capped }
}

/** Archives one mail after the other, progress every 10; returns how many failed. */
async function archiveEach(job: Job, accountId: string, ids: string[]): Promise<number> {
  const jobRow = () => getDb().updateTable('jobs').where('bullmq_id', '=', String(job.id))
  let failed = 0
  for (const [index, messageId] of ids.entries()) {
    try {
      await archiveMail(accountId, messageId) // NOSONAR: Gmail quota per user, one mail at a time
    } catch (err) {
      failed++
      logger.error({ messageId, err }, 'Failed to archive message')
    }
    const processed = index + 1
    const progress = Math.round((processed / ids.length) * 100)
    if (processed % 10 === 0 || processed === ids.length) await jobRow().set({ progress, processed }).execute() // NOSONAR
    await job.updateProgress(progress) // NOSONAR
  }
  return failed
}

/** Title and body of the end-of-archive notification. */
function archiveNotice({ archivedCount, failed, allFailed, capped, continues }: {
  archivedCount: number; failed: number; allFailed: boolean; capped: boolean; continues: boolean
}) {
  const failedNote = failed ? `, ${failed} en échec` : ''
  if (continues) {
    return { title: 'Sauvegarde partielle', body: `Sauvegarde partielle : ${archivedCount} mails sauvegardés${failedNote}, la suite reprend automatiquement dans ${config.ARCHIVE_CONTINUE_DELAY_MIN} min.` }
  }
  if (capped) {
    return { title: 'Sauvegarde partielle', body: `Sauvegarde partielle : ${archivedCount} mails sauvegardés${failedNote}. Plafond atteint et reprise automatique arrêtée : relancez la sauvegarde pour la suite.` }
  }
  return { title: allFailed ? 'Archivage échoué' : 'Archivage terminé', body: `${archivedCount} mail(s) archivé(s) sur le NAS${failedNote}.` }
}

async function handleArchive(job: Job) {
  const { accountId, messageIds, query, differential = true, userId, chain = 0 } = job.data
  const db = getDb()
  // An IMAP account's backup (scheduler, « Sauvegarder », setup wizard) is an incremental IMAP sync, not Gmail
  const account = await db.selectFrom('mail_accounts').select('provider').where('id', '=', accountId).executeTakeFirst()
  if (account?.provider === 'imap') return runCountedJob(job, { done: 'Sauvegarde IMAP terminée', failed: 'Sauvegarde IMAP échouée' }, (onProgress) => syncImapAccount(accountId, onProgress))
  const jobRow = () => db.updateTable('jobs').where('bullmq_id', '=', String(job.id))

  try {
    const { ids, capped } = await idsToArchive(accountId, messageIds, query, differential)
    const total = ids.length
    await jobRow().set({ status: 'active', total }).execute()
    const failed = await archiveEach(job, accountId, ids)

    // Every message failing means a systemic problem (token, disk…), not a bad mail
    const allFailed = total > 0 && failed === total
    await jobRow().set({
      status: allFailed ? 'failed' : 'completed',
      progress: 100,
      processed: total,
      completed_at: new Date(),
      ...(failed ? { error: `${failed}/${total} message(s) failed to archive` } : {}),
    }).execute()

    const archivedCount = total - failed
    // Chain stops when a run saved nothing new (it would loop on the same failures) or after ARCHIVE_CHAIN_MAX runs
    const continues = capped && archivedCount > 0 && chain < config.ARCHIVE_CHAIN_MAX
    const continuationId = continues
      ? String((await enqueueJob('archive_mails', { accountId, userId, query, differential: true, chain: chain + 1 }, { delay: config.ARCHIVE_CONTINUE_DELAY_MIN * 60_000 })).id)
      : undefined

    if (userId) {
      await notify({
        userId,
        category: allFailed ? 'job_failed' : 'job_completed',
        ...archiveNotice({ archivedCount, failed, allFailed, capped, continues }),
        data: {
          jobId: String(job.id), count: archivedCount, failed,
          ...(capped ? { capped: true, query, continuationJobId: continuationId ?? null } : {}),
        },
      })
    }
  } catch (err) {
    await jobRow().set({ status: 'failed', error: String(err) }).execute()
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

/** End-of-bulk notification: done, or the cap reached (no auto-relaunch: label/mark actions keep matching the query and would loop; the UI offers « Relancer », B11). */
function bulkNotice(jobId: string, state: { processed: number; capped: boolean; estimate: number }, { query, action, labelId }: { query?: string; action: string; labelId?: string }) {
  if (!state.capped) {
    return { title: 'Opération bulk terminée', body: `${state.processed} élément(s) traité(s) (${action}).`, data: { jobId, action, count: state.processed, capped: false } }
  }
  const remainingEstimate = Math.max(state.estimate - state.processed, 0)
  return {
    title: 'Plafond atteint',
    body: `${state.processed} mails traités sur ~${Math.max(state.estimate, state.processed)} — relancez l'action pour traiter la suite.`,
    data: { capped: true, jobId, query, action, labelId: labelId ?? null, processed: state.processed, remainingEstimate },
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

    if (userId) await notify({ userId, category: 'job_completed', ...bulkNotice(String(job.id), state, { query, action, labelId }) })
  } catch (err) {
    await recordJobFailure(job, userId, 'Opération bulk échouée', err, { action })
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
    // A failed run counts as a run: otherwise the scheduler re-enqueues the rule every minute until it succeeds
    await db.updateTable('rules').set({ last_run_at: new Date() }).where('id', '=', ruleId).execute()
    await recordJobFailure(job, job.data.userId, 'Règle échouée', err, { ruleId })
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
function handleDecryptArchives(job: Job) {
  const { accountId, passphrase } = job.data
  return runCountedJob(job, { done: 'Déchiffrement des archives terminé', failed: 'Déchiffrement des archives échoué', verb: 'déchiffrée(s)' }, async (onProgress) => {
    const result = await decryptArchives(accountId, passphrase, onProgress)
    // The decrypted mails get their full-text body back
    if (result.imported) await enqueueJob('backfill_body_text', { accountId: '' }, { dedupId: 'backfill_body_text' })
    return result
  })
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
      const fs = await import('node:fs/promises')
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
    await recordJobFailure(job, userId, 'Import mbox échoué', err)
    throw err
  }
}

// ─── Import IMAP ────────────────────────────────────────────
type CountedRun = { imported: number; skipped: number; errors: number }

/**
 * One IMAP pass (one-shot import, or an IMAP account's backup): progress, job row, one notification each way.
 * A login the server refuses flags the account « à reconnecter » (backup, restore: an import has no stored account).
 */
async function runCountedJob(job: Job, titles: { done: string; failed: string; verb?: string }, run: (onProgress: (done: number, total?: number) => Promise<void>) => Promise<CountedRun>) {
  const { accountId, userId } = job.data
  const db = getDb()
  const jobRow = () => db.updateTable('jobs').where('bullmq_id', '=', String(job.id))
  await jobRow().set({ status: 'active' }).execute()

  try {
    const result = await run(async (done, total) => {
      const progress = total ? Math.round((done / total) * 100) : 0
      await job.updateProgress(progress)
      await jobRow().set({ progress, processed: done, ...(total ? { total } : {}) }).execute()
    })
    await jobRow().set({
      status: 'completed', progress: 100, completed_at: new Date(),
      processed: result.imported + result.skipped, total: result.imported + result.skipped + result.errors,
    }).execute()
    if (userId) {
      await notify({
        userId,
        category: 'job_completed',
        title: titles.done,
        body: `${result.imported} ${titles.verb ?? 'importé(s)'}, ${result.skipped} ignoré(s), ${result.errors} erreur(s).`,
        data: { jobId: String(job.id), ...result },
      })
    }
    return result
  } catch (err) {
    if ((job.name === 'archive_mails' || job.name === 'restore_imap') && isImapAuthError(err)) await flagReauthRequired(accountId, 'Le serveur IMAP')
    await recordJobFailure(job, userId, titles.failed, err)
    throw err
  }
}

function handleImportImap(job: Job) {
  const { accountId, userId, imapConfig } = job.data
  return runCountedJob(job, { done: 'Import IMAP terminé', failed: 'Import IMAP échoué' }, (onProgress) => importImap(userId, accountId, imapConfig, { onProgress }))
}

function handleRestoreGmail(job: Job) {
  const { accountId, mailIds } = job.data
  return runCountedJob(job, { done: 'Restauration dans Gmail terminée', failed: 'Restauration dans Gmail échouée', verb: 'restauré(s)' }, (onProgress) => restoreToGmail(accountId, mailIds, onProgress))
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
    await recordJobFailure(job, userId, 'Rétention échouée', err)
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
    if (!job.data.accountId) await saveIntegrityResult(result)
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

function handleRestoreImap(job: Job) {
  const { accountId, mailIds } = job.data
  return runCountedJob(job, { done: 'Restauration IMAP terminée', failed: 'Restauration IMAP échouée', verb: 'restauré(s)' }, (onProgress) => restoreToImap(accountId, mailIds, onProgress))
}
