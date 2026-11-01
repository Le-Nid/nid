import type { ImapFlow, ListResponse } from 'imapflow'
import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { importSingleEml } from '../archive/import.service'
import { createLogger } from '../logger'
import { openSecret } from '../utils/secret'

const logger = createLogger('imap')

export interface ImapSettings {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}

export interface ImapSyncResult {
  imported: number
  skipped: number
  errors: number
  folders: number
}

async function connect(s: ImapSettings): Promise<ImapFlow> {
  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.password }, logger: false })
  await client.connect()
  return client
}

/** The server refused the login (bad password, app password required…), as opposed to a network error. */
export function isImapAuthError(err: unknown): boolean {
  return !!(err as { authenticationFailed?: boolean } | null)?.authenticationFailed
}

/** Logs in and out: the settings are only saved when this succeeds. */
export async function testImapLogin(s: ImapSettings): Promise<void> {
  const client = await connect(s)
  await client.logout()
}

async function getImapSettings(accountId: string): Promise<ImapSettings> {
  const a = await getDb().selectFrom('mail_accounts')
    .select(['provider', 'imap_host', 'imap_port', 'imap_secure', 'imap_user', 'imap_password'])
    .where('id', '=', accountId).executeTakeFirst()
  if (a?.provider !== 'imap' || !a.imap_host || !a.imap_user || !a.imap_password) throw new Error(`Not an IMAP account: ${accountId}`)
  return { host: a.imap_host, port: a.imap_port ?? 993, secure: a.imap_secure ?? true, user: a.imap_user, password: openSecret(a.imap_password) }
}

// Junk and trash are not worth keeping; « All Mail » (Gmail, some servers) repeats every other folder
const SKIPPED_USES = new Set([String.raw`\Junk`, String.raw`\Trash`, String.raw`\All`])

export function foldersToSync(list: ListResponse[]): ListResponse[] {
  return list.filter((f) => !f.flags.has(String.raw`\Noselect`) && !(f.specialUse && SKIPPED_USES.has(f.specialUse)))
}

type SyncContext = { accountId: string; result: ImapSyncResult; onProgress?: (done: number) => Promise<void> }

/** One fetched message into the archive; false (logged, counted) when it could not be archived. */
async function archiveMessage(accountId: string, folder: string, uid: number, source: Buffer, result: ImapSyncResult): Promise<boolean> {
  try {
    const outcome = await importSingleEml(getDb(), getLocalStorage(), accountId, source, [folder])
    result[outcome === 'imported' ? 'imported' : 'skipped']++
    return true
  } catch (err) {
    result.errors++
    logger.error({ err, accountId, folder, uid }, 'IMAP message not archived')
    return false
  }
}

/**
 * One folder: archives the UIDs above the last one archived, then moves the folder's mark.
 * A changed UIDVALIDITY (folder recreated) restarts the folder; already archived mails are skipped by Message-ID.
 */
async function syncFolder(client: ImapFlow, folder: ListResponse, { accountId, result, onProgress }: SyncContext) {
  const db = getDb()
  const box = client.mailbox
  if (!box) return
  const uidValidity = Number(box.uidValidity)
  const state = await db.selectFrom('imap_folder_state').select(['uid_validity', 'last_uid'])
    .where('account_id', '=', accountId).where('folder', '=', folder.path).executeTakeFirst()
  const from = state && Number(state.uid_validity) === uidValidity ? Number(state.last_uid) : 0
  result.folders++
  // `n:*` always returns the newest message, even below n: nothing to fetch when no UID is above the mark
  if (box.uidNext <= from + 1) return

  // After a failure the folder's mark stops moving: that mail is retried next run (later ones are skipped by Message-ID)
  let lastUid = from
  let failed = false
  for await (const msg of client.fetch(`${from + 1}:*`, { uid: true, source: true }, { uid: true })) {
    if (msg.uid <= from || !msg.source) continue
    // One IMAP connection, UIDs in order: the mark is only safe if mails are archived one after the other
    const ok = await archiveMessage(accountId, folder.path, msg.uid, msg.source, result) // NOSONAR
    failed ||= !ok
    if (!failed) lastUid = msg.uid
    const done = result.imported + result.skipped + result.errors
    if (onProgress && done % 20 === 0) await onProgress(done) // NOSONAR: progress follows the sequential import
  }
  await db.insertInto('imap_folder_state')
    .values({ account_id: accountId, folder: folder.path, uid_validity: uidValidity, last_uid: lastUid })
    .onConflict((oc) => oc.columns(['account_id', 'folder']).doUpdateSet({ uid_validity: uidValidity, last_uid: lastUid }))
    .execute()
}

/** A logged-in client for a stored IMAP account; the caller logs out. */
export async function connectImapAccount(accountId: string): Promise<ImapFlow> {
  return connect(await getImapSettings(accountId))
}

/** Archives what is new in every folder since the last run; the folder becomes an archive label. */
export async function syncImapAccount(
  accountId: string,
  onProgress?: (done: number) => Promise<void>,
): Promise<ImapSyncResult> {
  const client = await connectImapAccount(accountId)
  const result: ImapSyncResult = { imported: 0, skipped: 0, errors: 0, folders: 0 }
  try {
    for (const folder of foldersToSync(await client.list())) {
      // A single IMAP connection selects one folder at a time
      const lock = await client.getMailboxLock(folder.path) // NOSONAR
      try {
        await syncFolder(client, folder, { accountId, result, onProgress }) // NOSONAR: same connection, one folder at a time
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return result
}
