import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { createLogger } from '../logger'

const logger = createLogger('trash')

/**
 * Permanently delete archived mails that have been in the trash
 * longer than the configured retention period.
 */
export async function purgeArchiveTrash(): Promise<{ deleted: number }> {
  const db = getDb()

  // Read config
  const retentionConfig = await db
    .selectFrom('system_config')
    .select('value')
    .where('key', '=', 'archive_trash_retention_days')
    .executeTakeFirst()

  const enabledConfig = await db
    .selectFrom('system_config')
    .select('value')
    .where('key', '=', 'archive_trash_purge_enabled')
    .executeTakeFirst()

  const enabled = enabledConfig ? JSON.parse(String(enabledConfig.value)) : true
  if (!enabled) {
    logger.info('Archive trash purge is disabled')
    return { deleted: 0 }
  }

  const retentionDays = retentionConfig ? Number(JSON.parse(String(retentionConfig.value))) : 30
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
