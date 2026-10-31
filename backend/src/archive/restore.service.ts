import fs from 'node:fs'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { findOrCreateLabel } from '../labels/labels.service'
import { createLogger } from '../logger'

const logger = createLogger('restore')

export type RestoreResult = { imported: number; skipped: number; errors: number }

// Gmail refuses these on insert (DRAFT, CHAT), or they would undo the restore (TRASH, SPAM)
const DROPPED_LABELS = new Set(['DRAFT', 'CHAT', 'TRASH', 'SPAM'])

/**
 * Gmail label ids for an archived mail's labels: system and live user labels as they are, a user label deleted
 * since (or only known from an mbox import) recreated by name, unknown ids dropped.
 */
async function restorableLabels(accountId: string, labelIds: string[]): Promise<string[]> {
  if (!labelIds.length) return []
  const rows = await getDb().selectFrom('gmail_labels').select(['id', 'name', 'type', 'deleted_at'])
    .where('account_id', '=', accountId).where('id', 'in', labelIds).execute()
  const out: string[] = []
  for (const l of rows) {
    if (DROPPED_LABELS.has(l.id)) continue
    const live = l.type !== 'imported' && (l.type !== 'user' || !l.deleted_at)
    out.push(live ? l.id : await findOrCreateLabel(accountId, l.name)) // NOSONAR: labels created one by one (Gmail 409 on a race)
  }
  return out
}

const status = (err: any) => err?.code ?? err?.response?.status ?? err?.status

/**
 * Puts archived mails back in Gmail from their EML (same headers, date and labels).
 * Still in Gmail: skipped; in Gmail's trash: taken out of it. Once inserted, the archive row points to the new
 * Gmail id so the next differential backup does not archive the mail a second time.
 * An encrypted archive cannot be read here (the passphrase is not kept): counted as an error.
 */
export async function restoreToGmail(
  accountId: string,
  mailIds: string[],
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<RestoreResult> {
  const db = getDb()
  const mails = await db.selectFrom('archived_mails')
    .select(['id', 'gmail_message_id', 'label_ids', 'eml_path', 'is_encrypted'])
    .where('account_id', '=', accountId).where('id', 'in', mailIds).where('deleted_at', 'is', null)
    .execute()
  const gmail = await getGmailClient(accountId)
  const result: RestoreResult = { imported: 0, skipped: 0, errors: 0 }

  for (const mail of mails) {
    try {
      // Sequential on purpose: one account, Gmail's per-user quota (gmailRetry backs off on 429)
      const present = await gmailRetry(() => gmail.users.messages.get({ userId: 'me', id: mail.gmail_message_id, format: 'minimal' })) // NOSONAR
        .then((r) => r.data, (err) => { if (status(err) === 404) return null; throw err })
      if (present?.labelIds?.includes('TRASH')) {
        await gmailRetry(() => gmail.users.messages.untrash({ userId: 'me', id: mail.gmail_message_id })) // NOSONAR
        result.imported++
      } else if (present) {
        result.skipped++
      } else if (mail.is_encrypted) {
        result.errors++
        logger.warn({ accountId, mailId: mail.id }, 'Encrypted archive not restored')
      } else {
        const labelIds = await restorableLabels(accountId, mail.label_ids) // NOSONAR
        const res = await gmailRetry(() => gmail.users.messages.insert({ // NOSONAR
          userId: 'me',
          internalDateSource: 'dateHeader',
          requestBody: { labelIds },
          media: { mimeType: 'message/rfc822', body: fs.createReadStream(mail.eml_path) },
        }))
        await db.updateTable('archived_mails').set({ gmail_message_id: res.data.id! }).where('id', '=', mail.id).execute() // NOSONAR
        result.imported++
      }
    } catch (err) {
      result.errors++
      logger.error({ err, accountId, mailId: mail.id }, 'Archived mail not restored to Gmail')
    }
    const done = result.imported + result.skipped + result.errors
    if (onProgress) await onProgress(done, mails.length) // NOSONAR: progress follows the sequential restore
  }
  return result
}
