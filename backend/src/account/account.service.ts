import path from 'node:path'
import { getDb } from '../db'
import { config } from '../config'
import { getLocalStorage } from '../storage/storage.service'
import { createLogger } from '../logger'

const logger = createLogger('account')

/** Error carrying an HTTP status, rendered as-is by the global error handler. */
function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

/**
 * Permanently delete a user: DB rows (FK cascades take the Gmail accounts, archives, rules…) then the
 * archive files, which live under ARCHIVE_PATH/<accountId>/ (attachments are deduplicated per account only).
 * Refuses to delete the last active admin, so the instance never ends up without one.
 */
export async function deleteUser(userId: string): Promise<{ email: string }> {
  const db = getDb()
  const user = await db.selectFrom('users').select(['email', 'role']).where('id', '=', userId).executeTakeFirst()
  if (!user) throw httpError(404, 'User not found')

  if (user.role === 'admin') {
    const admins = await db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('role', '=', 'admin')
      .where('is_active', '=', true)
      .where('id', '!=', userId)
      .executeTakeFirst()
    if (Number(admins?.n ?? 0) === 0) throw httpError(409, 'Cannot delete the last admin')
  }

  const accounts = await db.selectFrom('mail_accounts').select('id').where('user_id', '=', userId).execute()
  await db.deleteFrom('users').where('id', '=', userId).execute()

  const storage = getLocalStorage()
  for (const { id } of accounts) await storage.deleteDir(path.join(config.ARCHIVE_PATH, id))
  logger.info({ userId, accounts: accounts.length }, 'user deleted')
  return { email: user.email }
}

/**
 * GDPR export (art. 15/20): everything Nid stores about the user, as JSON. Secrets are left out (password and
 * TOTP hashes, OAuth tokens, webhook credentials, share tokens), and so are the mail bodies: the mails
 * themselves are exported per account as ZIP/mbox from the archives.
 */
export async function exportUserData(userId: string) {
  const db = getDb()
  // shortcut: archived_mails is loaded in memory, fine up to ~100k mails per user; stream it if exports time out
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'display_name', 'avatar_url', 'is_active', 'max_gmail_accounts',
      'storage_quota_bytes', 'totp_enabled', 'last_login_at', 'created_at', 'updated_at'])
    .where('id', '=', userId)
    .executeTakeFirst()
  if (!user) throw httpError(404, 'User not found')

  const gmailAccounts = await db
    .selectFrom('mail_accounts')
    .select(['id', 'email', 'is_active', 'backup_enabled', 'backup_interval', 'created_at', 'updated_at'])
    .where('user_id', '=', userId)
    .execute()
  const ids = gmailAccounts.map((a) => a.id)
  // Every table passed here has a account_id column; the cast only picks one for Kysely's typing
  const byAccount = async (table: 'rules' | 'gmail_labels' | 'email_expirations' | 'newsletter_scans'
    | 'sender_scores' | 'cleanup_suggestions' | 'inbox_zero_snapshots'): Promise<unknown[]> =>
    ids.length ? db.selectFrom(table as 'rules').selectAll().where('account_id', 'in', ids).execute() : []

  const archivedMails = ids.length
    ? await db.selectFrom('archived_mails').selectAll().where('account_id', 'in', ids).execute()
    : []

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    user,
    socialAccounts: await db.selectFrom('user_social_accounts')
      .select(['provider', 'email', 'display_name', 'created_at']).where('user_id', '=', userId).execute(),
    notificationPreferences: await db.selectFrom('notification_preferences').selectAll()
      .where('user_id', '=', userId).executeTakeFirst() ?? null,
    notifications: await db.selectFrom('notifications').selectAll().where('user_id', '=', userId).execute(),
    auditLogs: await db.selectFrom('audit_logs').selectAll().where('user_id', '=', userId).execute(),
    webhooks: await db.selectFrom('webhooks')
      .select(['id', 'name', 'url', 'type', 'events', 'is_active', 'last_triggered_at', 'last_status', 'created_at'])
      .where('user_id', '=', userId).execute(),
    passkeys: await db.selectFrom('passkeys').select(['id', 'name', 'created_at', 'last_used_at'])
      .where('user_id', '=', userId).execute(),
    savedSearches: await db.selectFrom('saved_searches').selectAll().where('user_id', '=', userId).execute(),
    retentionPolicies: await db.selectFrom('retention_policies').selectAll().where('user_id', '=', userId).execute(),
    archiveShares: await db.selectFrom('archive_shares')
      .select(['id', 'archived_mail_id', 'expires_at', 'access_count', 'max_access', 'created_at'])
      .where('user_id', '=', userId).execute(),
    jobs: await db.selectFrom('jobs').selectAll().where('user_id', '=', userId).execute(),
    gmailAccounts,
    rules: await byAccount('rules'),
    labels: await byAccount('gmail_labels'),
    expirations: await byAccount('email_expirations'),
    newsletterScans: await byAccount('newsletter_scans'),
    senderScores: await byAccount('sender_scores'),
    cleanupSuggestions: await byAccount('cleanup_suggestions'),
    inboxZeroSnapshots: await byAccount('inbox_zero_snapshots'),
    archivedMails: archivedMails.map(({ body_text: _body, eml_path: _path, ...m }) => m),
    // Join rather than `in (mailIds)`: a big archive would exceed PostgreSQL's 65535 bind parameters
    archivedAttachments: ids.length
      ? await db.selectFrom('archived_attachments')
        .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
        .select(['archived_attachments.id', 'archived_attachments.archived_mail_id', 'archived_attachments.filename',
          'archived_attachments.mime_type', 'archived_attachments.size_bytes', 'archived_attachments.content_hash',
          'archived_attachments.created_at'])
        .where('archived_mails.account_id', 'in', ids).execute()
      : [],
  }
}
