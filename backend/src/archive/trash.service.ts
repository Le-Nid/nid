import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { createLogger } from '../logger'

const logger = createLogger('trash')

/** Instance trash settings (system_config), with the defaults the purge applies. */
async function getTrashConfig(): Promise<{ retentionDays: number; purgeEnabled: boolean }> {
  const db = getDb()
  const read = async (key: string) =>
    (await db.selectFrom('system_config').select('value').where('key', '=', key).executeTakeFirst())?.value
  const retention = await read('archive_trash_retention_days')
  const enabled = await read('archive_trash_purge_enabled')
  // A missing row means the default; jsonb `false` is a real value
  return {
    retentionDays: retention === undefined ? 30 : Number(JSON.parse(String(retention))),
    purgeEnabled: enabled === undefined ? true : Boolean(JSON.parse(String(enabled))),
  }
}

/** Archive trash of every account (B15): volume and when its oldest mail gets purged. */
export async function getArchiveTrashSummary() {
  const row = await getDb()
    .selectFrom('archived_mails')
    .select((eb) => [
      eb.fn.countAll<string>().as('count'),
      eb.fn.sum<string>('size_bytes').as('size'),
      eb.fn.min<Date>('deleted_at').as('oldest'),
    ])
    .where('deleted_at', 'is not', null)
    .executeTakeFirst()
  const { retentionDays, purgeEnabled } = await getTrashConfig()
  const oldest = row?.oldest ? new Date(row.oldest).getTime() : null
  return {
    count: Number(row?.count ?? 0),
    sizeBytes: Number(row?.size ?? 0),
    retentionDays,
    purgeEnabled,
    nextPurgeAt: purgeEnabled && oldest !== null ? new Date(oldest + retentionDays * 86_400_000).toISOString() : null,
  }
}

const EMPTY_BATCH = 1000 // keeps each `IN (...)` well under Postgres' bind parameter limit

/** Permanently delete the archive trash of every account (B15), by batches. */
export async function emptyAllArchiveTrash(): Promise<{ deleted: number; sizeBytes: number }> {
  const db = getDb()
  let deleted = 0
  let sizeBytes = 0
  for (;;) {
    const mails = await db
      .selectFrom('archived_mails')
      .select(['id', 'eml_path', 'size_bytes'])
      .where('deleted_at', 'is not', null)
      .limit(EMPTY_BATCH)
      .execute()
    await deleteArchivedMails(mails)
    deleted += mails.length
    sizeBytes += mails.reduce((sum, m) => sum + Number(m.size_bytes ?? 0), 0)
    if (mails.length < EMPTY_BATCH) break
  }
  logger.info(`Emptied the instance archive trash: ${deleted} mail(s) permanently deleted`)
  return { deleted, sizeBytes }
}

/**
 * Permanently delete archived mails that have been in the trash
 * longer than the configured retention period.
 */
export async function purgeArchiveTrash(): Promise<{ deleted: number }> {
  const db = getDb()

  const { retentionDays, purgeEnabled } = await getTrashConfig()
  if (!purgeEnabled) {
    logger.info('Archive trash purge is disabled')
    return { deleted: 0 }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  // Find expired trash mails
  const mails = await db
    .selectFrom('archived_mails')
    .innerJoin('gmail_accounts', 'gmail_accounts.id', 'archived_mails.gmail_account_id')
    .select(['archived_mails.id', 'archived_mails.eml_path', 'gmail_accounts.user_id'])
    .where('archived_mails.deleted_at', 'is not', null)
    .where('archived_mails.deleted_at', '<', cutoff)
    .execute()

  if (mails.length === 0) return { deleted: 0 }

  await deleteArchivedMails(mails)

  logger.info(`Purged ${mails.length} expired trash mail(s) (retention: ${retentionDays} days)`)
  return { deleted: mails.length }
}

/** Delete files that no archived_attachments row points to anymore (attachments are shared by content hash). */
export async function deleteUnreferencedFiles(filePaths: string[]): Promise<number> {
  const unique = [...new Set(filePaths)]
  if (unique.length === 0) return 0

  const stillUsed = await getDb()
    .selectFrom('archived_attachments')
    .select('file_path')
    .where('file_path', 'in', unique)
    .execute()
  const used = new Set(stillUsed.map((r) => r.file_path))

  const storage = getLocalStorage()
  let deleted = 0
  for (const filePath of unique) {
    if (used.has(filePath)) continue
    await storage.deleteFile(filePath)
    deleted++
  }
  return deleted
}

/** Permanently delete archived mails: DB rows first, then the files nothing else uses. */
export async function deleteArchivedMails(mails: { id: string; eml_path: string }[]): Promise<void> {
  if (mails.length === 0) return
  const db = getDb()
  const ids = mails.map((m) => m.id)

  const attachments = await db
    .selectFrom('archived_attachments')
    .select('file_path')
    .where('archived_mail_id', 'in', ids)
    .execute()

  await db.deleteFrom('archived_attachments').where('archived_mail_id', 'in', ids).execute()
  await db.deleteFrom('archived_mails').where('id', 'in', ids).execute()

  await deleteUnreferencedFiles(attachments.map((a) => a.file_path))
  const storage = getLocalStorage()
  for (const mail of mails) await storage.deleteFile(mail.eml_path)
}
