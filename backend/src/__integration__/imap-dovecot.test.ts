// IMAP backup and restore against a real Dovecot (STARTTLS) and PostgreSQL: CI job backend-imap in .github/workflows/ci.yml.
// Env: DATABASE_URL, IMAP_TEST_HOST/PORT/PASSWORD, ARCHIVE_PATH, JWT_SECRET (+ config's required vars), NODE_EXTRA_CA_CERTS
import Fastify from 'fastify'
import { ImapFlow } from 'imapflow'
import { closeDb, getDb, runMigrations } from '../db'
import { sealSecret } from '../utils/secret'
import { syncImapAccount } from '../imap/imap.service'
import { restoreToImap } from '../archive/restore.service'
import { imapAccountRoutes } from '../routes/imap-accounts'

const HOST = process.env.IMAP_TEST_HOST ?? '127.0.0.1'
const PORT = Number(process.env.IMAP_TEST_PORT ?? 31143)
const PASSWORD = process.env.IMAP_TEST_PASSWORD ?? 'nid-ci'
// The static passdb takes any user: one mailbox per run
const USER = `ci-${Date.now()}@nid.test`

const db = getDb()
let accountId = ''
let server: ImapFlow

const eml = (id: string, subject: string) =>
  Buffer.from(`Message-ID: <${id}@nid.test>\r\nFrom: Bob <bob@nid.test>\r\nTo: ${USER}\r\nSubject: ${subject}\r\nDate: Mon, 1 Jan 2024 10:00:00 +0000\r\n\r\nBody of ${subject}\r\n`)
/** APPEND with its internal date: what SEARCH SINCE looks at. */
const put = (folder: string, id: string, date: string) => server.append(folder, eml(id, id), [], new Date(date))
const archivedId = async (id: string) =>
  (await db.selectFrom('archived_mails').select('id').where('account_id', '=', accountId).where('gmail_message_id', '=', `${id}@nid.test`).executeTakeFirstOrThrow()).id
async function onServer(folder: string, id: string): Promise<boolean> {
  const lock = await server.getMailboxLock(folder)
  try {
    const uids = await server.search({ header: { 'message-id': `<${id}@nid.test>` } }, { uid: true })
    return Array.isArray(uids) && uids.length > 0
  } finally {
    lock.release()
  }
}
async function removeFromServer(folder: string, id: string) {
  const lock = await server.getMailboxLock(folder)
  try {
    await server.messageDelete({ header: { 'message-id': `<${id}@nid.test>` } }, { uid: true })
  } finally {
    lock.release()
  }
}

beforeAll(async () => {
  await runMigrations()
  const user = await db.insertInto('users').values({ email: USER, password_hash: 'x' }).returning('id').executeTakeFirstOrThrow()
  const account = await db.insertInto('mail_accounts').values({
    user_id: user.id, email: USER, provider: 'imap',
    imap_host: HOST, imap_port: PORT, imap_secure: false, imap_user: USER, imap_password: sealSecret(PASSWORD),
  }).returning('id').executeTakeFirstOrThrow()
  accountId = account.id

  server = new ImapFlow({ host: HOST, port: PORT, secure: false, auth: { user: USER, pass: PASSWORD }, logger: false })
  await server.connect()
  await server.mailboxCreate('Factures')
  await put('INBOX', 'old', '2023-06-01T10:00:00Z')
  await put('INBOX', 'feb', '2024-02-01T10:00:00Z')
  await put('Factures', 'invoice', '2024-03-01T10:00:00Z')
})

afterAll(async () => {
  await server?.logout().catch(() => {})
  await closeDb()
})

it('archives every folder, then only what is new; the folder becomes a label', async () => {
  expect(await syncImapAccount(accountId)).toMatchObject({ imported: 3, skipped: 0, errors: 0 })
  const labels = await db.selectFrom('gmail_labels').select(['id', 'name']).where('account_id', '=', accountId).execute()
  expect(labels.map((l) => l.name).sort((a, b) => a.localeCompare(b))).toEqual(['Factures', 'INBOX'])
  const invoice = await db.selectFrom('archived_mails').select(['label_ids', 'body_text']).where('id', '=', await archivedId('invoice')).executeTakeFirstOrThrow()
  expect(invoice.label_ids).toEqual(['imported:Factures'])
  expect(invoice.body_text).toBe('Body of invoice')

  await put('INBOX', 'new', '2024-04-01T10:00:00Z')
  // Only the UID above INBOX's mark is fetched: nothing skipped
  expect(await syncImapAccount(accountId)).toMatchObject({ imported: 1, skipped: 0, errors: 0 })
})

it('chosen folders and a start date (SEARCH SINCE on the server); a new date restarts the folders', async () => {
  const app = Fastify()
  app.decorate('authenticate', async (req: any) => { req.user = { sub: 'ci' } })
  app.decorate('requireAccountOwnership', async () => {})
  await app.register(imapAccountRoutes)
  const folders = (await app.inject({ method: 'GET', url: `/${accountId}/folders` })).json()
  expect(folders.folders.map((f: { path: string }) => f.path)).toEqual(expect.arrayContaining(['INBOX', 'Factures']))
  expect(folders.chosen).toBeNull()
  const saved = await app.inject({ method: 'PUT', url: `/${accountId}/scope`, payload: { folders: ['INBOX'], since: '2024-01-01' } })
  expect(saved.statusCode).toBe(200)
  await app.close()

  await put('INBOX', 'too-old', '2020-01-01T10:00:00Z')
  await put('INBOX', 'recent', '2025-01-01T10:00:00Z')
  await put('Factures', 'not-chosen', '2025-01-01T10:00:00Z')
  // INBOX starts over from 2024-01-01: feb and new are already archived, recent is new; old/too-old never fetched
  expect(await syncImapAccount(accountId)).toMatchObject({ imported: 1, skipped: 2, errors: 0, folders: 1 })
  const ids = (await db.selectFrom('archived_mails').select('gmail_message_id').where('account_id', '=', accountId).execute()).map((r) => r.gmail_message_id)
  expect(ids).toContain('recent@nid.test')
  expect(ids).not.toContain('too-old@nid.test')
  expect(ids).not.toContain('not-chosen@nid.test')
})

it('restores a deleted mail to its folder (APPEND), skips one still there, then does not duplicate', async () => {
  await removeFromServer('INBOX', 'feb')
  await removeFromServer('Factures', 'invoice')
  const mailIds = [await archivedId('feb'), await archivedId('invoice'), await archivedId('old')]
  expect(await restoreToImap(accountId, mailIds)).toEqual({ imported: 2, skipped: 1, errors: 0 })
  expect(await onServer('INBOX', 'feb')).toBe(true)
  expect(await onServer('Factures', 'invoice')).toBe(true)
  expect(await onServer('INBOX', 'invoice')).toBe(false)
  // A retried job finds them by Message-ID
  expect(await restoreToImap(accountId, mailIds)).toEqual({ imported: 0, skipped: 3, errors: 0 })
})

it('a password the server refuses is an auth error with a clear message', async () => {
  await db.updateTable('mail_accounts').set({ imap_password: sealSecret('wrong-password') }).where('id', '=', accountId).execute()
  await expect(syncImapAccount(accountId)).rejects.toMatchObject({ authenticationFailed: true })
  await expect(restoreToImap(accountId, [await archivedId('feb')])).rejects.toMatchObject({
    authenticationFailed: true, message: expect.stringContaining('refusé le mot de passe'),
  })
})
