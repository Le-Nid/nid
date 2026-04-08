import { getDb } from '../db'
import { getStorageForUser } from '../storage/storage.service'
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

  // Group by user for storage access
  const byUser = new Map<string, { ids: string[], emlPaths: string[] }>()
  for (const mail of mails) {
    const entry = byUser.get(mail.user_id) ?? { ids: [], emlPaths: [] }
    entry.ids.push(mail.id)
    entry.emlPaths.push(mail.eml_path)
    byUser.set(mail.user_id, entry)
  }

  for (const [userId, { ids, emlPaths }] of byUser) {
    const storage = await getStorageForUser(userId)

    // Delete attachments
    const attachments = await db
      .selectFrom('archived_attachments')
      .select(['id', 'file_path'])
      .where('archived_mail_id', 'in', ids)
      .execute()

    for (const att of attachments) {
      try { await storage.deleteFile(att.file_path) } catch { /* ignore */ }
    }

    if (attachments.length) {
      await db
        .deleteFrom('archived_attachments')
        .where('archived_mail_id', 'in', ids)
        .execute()
    }

    // Delete EML files
    for (const emlPath of emlPaths) {
      try { await storage.deleteFile(emlPath) } catch { /* ignore */ }
    }

    // Delete DB records
    await db
      .deleteFrom('archived_mails')
      .where('id', 'in', ids)
      .execute()
  }

  logger.info(`Purged ${mails.length} expired trash mail(s) (retention: ${retentionDays} days)`)
  return { deleted: mails.length }
}
