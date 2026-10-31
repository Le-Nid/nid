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

export async function getImapSettings(accountId: string): Promise<ImapSettings> {
  const a = await getDb().selectFrom('mail_accounts')
    .select(['provider', 'imap_host', 'imap_port', 'imap_secure', 'imap_user', 'imap_password'])
    .where('id', '=', accountId).executeTakeFirst()
  if (a?.provider !== 'imap' || !a.imap_host || !a.imap_user || !a.imap_password) throw new Error(`Not an IMAP account: ${accountId}`)
  return { host: a.imap_host, port: a.imap_port ?? 993, secure: a.imap_secure ?? true, user: a.imap_user, password: openSecret(a.imap_password) }
}

// Junk and trash are not worth keeping; « All Mail » (Gmail, some servers) repeats every other folder
const SKIPPED_USES = new Set(['\\Junk', '\\Trash', '\\All'])

export function foldersToSync(list: ListResponse[]): ListResponse[] {
  return list.filter((f) => !f.flags.has('\\Noselect') && !(f.specialUse && SKIPPED_USES.has(f.specialUse)))
}

/**
 * Archives what is new in every folder since the last run: per folder, the UIDs above the last one archived.
 * A changed UIDVALIDITY (folder recreated) restarts the folder; already archived mails are skipped by Message-ID.
 * The folder becomes an archive label.
 */
export async function syncImapAccount(
  accountId: string,
  onProgress?: (done: number) => Promise<void>,
): Promise<ImapSyncResult> {
  const db = getDb()
  const storage = getLocalStorage()
  const client = await connect(await getImapSettings(accountId))
  const result: ImapSyncResult = { imported: 0, skipped: 0, errors: 0, folders: 0 }
  try {
    for (const folder of foldersToSync(await client.list())) {
      const lock = await client.getMailboxLock(folder.path)
      try {
        const box = client.mailbox
        if (!box) continue
        const uidValidity = Number(box.uidValidity)
        const state = await db.selectFrom('imap_folder_state').select(['uid_validity', 'last_uid'])
          .where('account_id', '=', accountId).where('folder', '=', folder.path).executeTakeFirst()
        let lastUid = state && Number(state.uid_validity) === uidValidity ? Number(state.last_uid) : 0
        result.folders++
        // `n:*` always returns the newest message, even below n: nothing to fetch when no UID is above lastUid
        if (box.uidNext <= lastUid + 1) continue

        // After a failure the folder's mark stops moving: that mail is retried next run (later ones are skipped by Message-ID)
        let failed = false
        const from = lastUid
        for await (const msg of client.fetch(`${from + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (msg.uid <= from || !msg.source) continue
          try {
            const outcome = await importSingleEml(db, storage, accountId, msg.source, [folder.path])
            result[outcome === 'imported' ? 'imported' : 'skipped']++
            if (!failed) lastUid = msg.uid
          } catch (err) {
            failed = true
            result.errors++
            logger.error({ err, accountId, folder: folder.path, uid: msg.uid }, 'IMAP message not archived')
          }
          const done = result.imported + result.skipped + result.errors
          if (onProgress && done % 20 === 0) await onProgress(done)
        }
        await db.insertInto('imap_folder_state')
          .values({ account_id: accountId, folder: folder.path, uid_validity: uidValidity, last_uid: lastUid })
          .onConflict((oc) => oc.columns(['account_id', 'folder']).doUpdateSet({ uid_validity: uidValidity, last_uid: lastUid }))
          .execute()
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return result
}
