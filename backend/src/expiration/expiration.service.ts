import { getDb } from '../db'
import { trashMessages } from '../gmail/gmail.service'
import { createLogger } from '../logger'

const logger = createLogger('expiration')

/**
 * The Expiration screen became rule templates (B8): no expiration can be created any more. The ones already set
 * still trash their mail when due, as promised; once email_expirations has no pending row, drop the table, this
 * service and its scheduled task (design/ui-redesign.md O5).
 */
export async function processExpiredEmails(): Promise<{ processed: number; errors: number }> {
  const db = getDb()
  const now = new Date()

  // Find all non-deleted expirations that have passed
  const expired = await db
    .selectFrom('email_expirations')
    .innerJoin('mail_accounts', 'email_expirations.account_id', 'mail_accounts.id')
    .select([
      'email_expirations.id',
      'email_expirations.account_id',
      'email_expirations.gmail_message_id',
      'email_expirations.subject',
    ])
    .where('email_expirations.is_deleted', '=', false)
    .where('email_expirations.expires_at', '<=', now)
    .where('mail_accounts.is_active', '=', true)
    .execute()

  if (expired.length === 0) return { processed: 0, errors: 0 }

  logger.info(`Processing ${expired.length} expired email(s)`)

  // Group by account
  const byAccount = new Map<string, typeof expired>()
  for (const item of expired) {
    const list = byAccount.get(item.account_id) ?? []
    list.push(item)
    byAccount.set(item.account_id, list)
  }

  let processed = 0
  let errors = 0

  for (const [accountId, items] of byAccount) {
    const messageIds = items.map((i) => i.gmail_message_id)
    const expirationIds = items.map((i) => i.id)

    try {
      await trashMessages(accountId, messageIds)

      // Mark as deleted
      await db
        .updateTable('email_expirations')
        .set({ is_deleted: true, deleted_at: now })
        .where('id', 'in', expirationIds)
        .execute()

      processed += items.length
      logger.info(`Trashed ${items.length} expired email(s) for account ${accountId}`)
    } catch (err) {
      errors += items.length
      logger.error({ err, accountId }, `Failed to trash expired emails`)
    }
  }

  return { processed, errors }
}
