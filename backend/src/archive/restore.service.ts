import fs from 'node:fs'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { findOrCreateLabel } from '../labels/labels.service'
import { connectImapAccount, isImapAuthError } from '../imap/imap.service'
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
        .then((r) => r.data, (err) => {
          if (status(err) === 404) return null
          throw err
        })
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

/**
 * Puts archived mails back on an IMAP account's server (APPEND of the EML, read, at its date) in the folder they
 * were archived from (their label naming a folder still on the server), else INBOX. A mail whose Message-ID is
 * already in that folder is skipped, so a retried job does not duplicate; the next sync skips it by Message-ID too.
 */
export async function restoreToImap(
  accountId: string,
  mailIds: string[],
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<RestoreResult> {
  const mails = await getDb().selectFrom('archived_mails')
    .select(['id', 'gmail_message_id', 'label_ids', 'eml_path', 'is_encrypted', 'date'])
    .where('account_id', '=', accountId).where('id', 'in', mailIds).where('deleted_at', 'is', null)
    .execute()
  const client = await connectImapAccount(accountId).catch((err) => {
    if (!isImapAuthError(err)) throw err
    // Kept as an auth error: the worker flags the account « à reconnecter »
    throw Object.assign(new Error('Le serveur IMAP a refusé le mot de passe : reconnectez le compte dans Paramètres › Comptes.'), { authenticationFailed: true })
  })
  const result: RestoreResult = { imported: 0, skipped: 0, errors: 0 }
  const count = async (outcome: keyof RestoreResult, n = 1) => {
    result[outcome] += n
    if (onProgress) await onProgress(result.imported + result.skipped + result.errors, mails.length)
  }
  try {
    for (const [folder, group] of await groupByImapFolder(client, accountId, mails)) {
      // One connection selects one folder at a time; a folder gone since list() fails its mails only
      const lock = await client.getMailboxLock(folder).catch((err) => { // NOSONAR
        logger.error({ err, accountId, folder }, 'IMAP folder not selectable, its mails not restored')
        return null
      })
      if (!lock) {
        await count('errors', group.length) // NOSONAR
        continue
      }
      try {
        // Same connection, one mail after the other
        for (const mail of group) await count(await appendMail(client, folder, mail, accountId)) // NOSONAR
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return result
}

type ImapClient = Awaited<ReturnType<typeof connectImapAccount>>
type RestoredMail = { id: string; gmail_message_id: string; label_ids: string[]; eml_path: string; is_encrypted: boolean; date: Date | null }

/** Mails by target folder: their first label naming a folder on the server (case-insensitive), else INBOX. */
async function groupByImapFolder<M extends RestoredMail>(client: ImapClient, accountId: string, mails: M[]): Promise<Map<string, M[]>> {
  const paths = new Map((await client.list()).filter((f) => !f.flags.has(String.raw`\Noselect`)).map((f) => [f.path.toLowerCase(), f.path]))
  const labelIds = [...new Set(mails.flatMap((m) => m.label_ids))]
  const labels = labelIds.length
    ? await getDb().selectFrom('gmail_labels').select(['id', 'name']).where('account_id', '=', accountId).where('id', 'in', labelIds).execute()
    : []
  const names = new Map(labels.map((l) => [l.id, l.name.toLowerCase()]))
  const byFolder = new Map<string, M[]>()
  for (const mail of mails) {
    const folder = mail.label_ids.map((id) => paths.get(names.get(id) ?? '')).find(Boolean) ?? 'INBOX'
    const group = byFolder.get(folder)
    if (group) group.push(mail)
    else byFolder.set(folder, [mail])
  }
  return byFolder
}

/** One mail into the selected folder; failures are logged and counted, never thrown. */
async function appendMail(client: ImapClient, folder: string, mail: RestoredMail, accountId: string): Promise<keyof RestoreResult> {
  try {
    if (mail.is_encrypted) {
      logger.warn({ accountId, mailId: mail.id }, 'Encrypted archive not restored')
      return 'errors'
    }
    if (await isInMailbox(client, mail.gmail_message_id)) return 'skipped'
    await client.append(folder, await fs.promises.readFile(mail.eml_path), [String.raw`\Seen`], mail.date ?? undefined)
    return 'imported'
  } catch (err) {
    logger.error({ err, accountId, mailId: mail.id, folder }, 'Archived mail not restored to IMAP')
    return 'errors'
  }
}

/** The selected folder holds this Message-ID (archive id of a mail imported without one: never found). */
async function isInMailbox(client: ImapClient, messageId: string): Promise<boolean> {
  if (messageId.startsWith('imported-')) return false
  // HEADER search matches substrings: the brackets keep `a@b` from matching `<xa@b>`
  const uids = await client.search({ header: { 'message-id': `<${messageId}>` } }, { uid: true })
  return Array.isArray(uids) && uids.length > 0
}
