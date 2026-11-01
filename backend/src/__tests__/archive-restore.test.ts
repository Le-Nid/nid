import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

// Real SQL compiled, each query answered by `answer(sql)`
const seen: CompiledQuery[] = []
let answer: (sql: string) => unknown[] = () => []
const fakeDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => { seen.push(q); return { rows: answer(q.sql), numAffectedRows: 1n } },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => fakeDb }))
const gmail = { users: { messages: { get: vi.fn(), untrash: vi.fn(), insert: vi.fn() } } }
vi.mock('../gmail/gmail.service', () => ({ getGmailClient: vi.fn(async () => gmail) }))
vi.mock('../gmail/gmail-throttle', () => ({ gmailRetry: (fn: () => unknown) => fn() }))
vi.mock('../labels/labels.service', () => ({ findOrCreateLabel: vi.fn(async (_a: string, name: string) => `Label_new_${name}`) }))
vi.mock('node:fs', () => ({ default: {
  createReadStream: vi.fn((p: string) => `stream:${p}`),
  promises: { readFile: vi.fn(async (p: string) => Buffer.from(`eml:${p}`)) },
} }))
const imap = { list: vi.fn(), getMailboxLock: vi.fn(), search: vi.fn(), append: vi.fn(), logout: vi.fn(async () => {}) }
const release = vi.fn()
const connectImapAccount = vi.fn(async () => imap)
vi.mock('../imap/imap.service', () => ({
  connectImapAccount: () => connectImapAccount(),
  isImapAuthError: (err: any) => !!err?.authenticationFailed,
}))

vi.mock('../jobs/queue', () => ({ enqueueJob: vi.fn(async () => ({ id: 'job-r' })) }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

import Fastify from 'fastify'
import { restoreToGmail, restoreToImap } from '../archive/restore.service'
import { archiveRoutes } from '../routes/archive'
import { enqueueJob } from '../jobs/queue'
import { logAudit } from '../audit/audit.service'
import { findOrCreateLabel } from '../labels/labels.service'

const mail = (id: string, extra: Record<string, unknown> = {}) => ({
  id, gmail_message_id: `g-${id}`, label_ids: [], eml_path: `/nas/${id}.eml`, is_encrypted: false, ...extra,
})
const notFound = Object.assign(new Error('nf'), { code: 404 })

beforeEach(() => { vi.clearAllMocks(); seen.length = 0 })

describe('restoreToGmail', () => {
  it('skips a mail still in Gmail, untrashes one in its trash, inserts a gone one with its labels', async () => {
    const LABELS = [
      { id: 'INBOX', name: 'INBOX', type: 'system', deleted_at: null },
      { id: 'TRASH', name: 'TRASH', type: 'system', deleted_at: null },
      { id: 'Label_1', name: 'Factures', type: 'user', deleted_at: null },
      { id: 'Label_2', name: 'Ancien', type: 'user', deleted_at: new Date() },
      { id: 'imported:Voyages', name: 'Voyages', type: 'imported', deleted_at: null },
    ]
    answer = (sql) => sql.includes('from "archived_mails"')
      ? [mail('a'), mail('b'), mail('c', { label_ids: ['INBOX', 'TRASH', 'Label_1', 'Label_2', 'imported:Voyages', 'Gone'] })]
      : sql.includes('from "gmail_labels"') ? LABELS : []
    gmail.users.messages.get
      .mockResolvedValueOnce({ data: { labelIds: ['INBOX'] } })
      .mockResolvedValueOnce({ data: { labelIds: ['TRASH'] } })
      .mockRejectedValueOnce(notFound)
    gmail.users.messages.insert.mockResolvedValueOnce({ data: { id: 'g-new' } })
    const progress = vi.fn()

    expect(await restoreToGmail('acc-1', ['a', 'b', 'c'], progress)).toEqual({ imported: 2, skipped: 1, errors: 0 })
    expect(gmail.users.messages.untrash).toHaveBeenCalledWith({ userId: 'me', id: 'g-b' })
    expect(gmail.users.messages.insert).toHaveBeenCalledWith({
      userId: 'me', internalDateSource: 'dateHeader',
      requestBody: { labelIds: ['INBOX', 'Label_1', 'Label_new_Ancien', 'Label_new_Voyages'] },
      media: { mimeType: 'message/rfc822', body: 'stream:/nas/c.eml' },
    })
    expect(findOrCreateLabel).toHaveBeenCalledTimes(2)
    const update = seen.find((q) => q.sql.startsWith('update "archived_mails"'))!
    expect(update.parameters).toEqual(['g-new', 'c'])
    expect(progress).toHaveBeenLastCalledWith(3, 3)
  })

  it('an encrypted archive or a Gmail error counts as an error; other mails go on', async () => {
    answer = (sql) => sql.includes('from "archived_mails"') ? [mail('a', { is_encrypted: true }), mail('b'), mail('c')] : []
    gmail.users.messages.get
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 500 }))
      .mockRejectedValueOnce(notFound)
    gmail.users.messages.insert.mockResolvedValueOnce({ data: { id: 'g-c2' } })
    expect(await restoreToGmail('acc-1', ['a', 'b', 'c'])).toEqual({ imported: 1, skipped: 0, errors: 2 })
    expect(gmail.users.messages.insert).toHaveBeenCalledTimes(1)
    expect(gmail.users.messages.insert.mock.calls[0][0].requestBody).toEqual({ labelIds: [] })
  })
})

describe('restoreToImap', () => {
  const folder = (path: string, flags: string[] = []) => ({ path, flags: new Set(flags) })
  beforeEach(() => {
    imap.list.mockResolvedValue([folder('INBOX'), folder('Factures/2024'), folder('[Gmail]', [String.raw`\Noselect`])])
    imap.getMailboxLock.mockResolvedValue({ release })
    imap.search.mockResolvedValue([])
  })

  it('appends each mail to its archived folder (else INBOX), skips one already there, counts errors', async () => {
    const date = new Date('2024-03-01T10:00:00Z')
    answer = (sql) => sql.includes('from "archived_mails"')
      ? [
          mail('a', { label_ids: ['imported:Factures/2024'], gmail_message_id: 'mid-a@x', date }),
          mail('b', { label_ids: ['imported:Gone', 'imported:Inbox'], gmail_message_id: 'mid-b@x' }),
          mail('c', { label_ids: [], gmail_message_id: 'imported-123-abc' }),
          mail('d', { is_encrypted: true }),
          mail('e', { label_ids: ['imported:Factures/2024'], gmail_message_id: 'mid-e@x' }),
        ]
      : sql.includes('from "gmail_labels"')
        ? [{ id: 'imported:Factures/2024', name: 'Factures/2024' }, { id: 'imported:Gone', name: 'Gone' }, { id: 'imported:Inbox', name: 'Inbox' }]
        : []
    imap.search.mockImplementation(async (q: any) => (q.header['message-id'] === '<mid-e@x>' ? [42] : []))
    imap.append.mockImplementation(async (_f: string, content: Buffer) => {
      if (content.toString().includes('/nas/c.eml')) throw new Error('NO [OVERQUOTA]')
      return { uid: 1 }
    })
    const progress = vi.fn()

    expect(await restoreToImap('acc-1', ['a', 'b', 'c', 'd', 'e'], progress)).toEqual({ imported: 2, skipped: 1, errors: 2 })
    expect(imap.append).toHaveBeenCalledWith('Factures/2024', Buffer.from('eml:/nas/a.eml'), [String.raw`\Seen`], date)
    expect(imap.append).toHaveBeenCalledWith('INBOX', Buffer.from('eml:/nas/b.eml'), [String.raw`\Seen`], undefined)
    // No Message-ID in the source: nothing to look for, appended
    expect(imap.search).toHaveBeenCalledTimes(3)
    expect(imap.getMailboxLock.mock.calls.map((c) => c[0])).toEqual(['Factures/2024', 'INBOX'])
    expect(release).toHaveBeenCalledTimes(2)
    expect(imap.logout).toHaveBeenCalled()
    expect(progress).toHaveBeenLastCalledWith(5, 5)
    const labels = seen.find((q) => q.sql.includes('from "gmail_labels"'))!
    expect(labels.sql).toContain('"account_id" = $1 and "id" in ($2, $3, $4)')
  })

  it('a folder that cannot be selected fails its mails only', async () => {
    answer = (sql) => sql.includes('from "archived_mails"')
      ? [mail('a', { label_ids: ['imported:Factures/2024'], gmail_message_id: 'mid-a@x' }), mail('b', { gmail_message_id: 'mid-b@x' })]
      : sql.includes('from "gmail_labels"') ? [{ id: 'imported:Factures/2024', name: 'Factures/2024' }] : []
    imap.getMailboxLock.mockRejectedValueOnce(new Error('NO [NONEXISTENT]'))
    expect(await restoreToImap('acc-1', ['a', 'b'])).toEqual({ imported: 1, skipped: 0, errors: 1 })
    expect(imap.append).toHaveBeenCalledTimes(1)
    expect(imap.append.mock.calls[0][0]).toBe('INBOX')
  })

  it('a refused password fails the job with a clear message, still an auth error', async () => {
    answer = () => [mail('a')]
    connectImapAccount.mockRejectedValueOnce(Object.assign(new Error('Command failed'), { authenticationFailed: true }))
    const err = await restoreToImap('acc-1', ['a']).catch((e) => e)
    expect(err.message).toMatch(/refusé le mot de passe/)
    expect(err.authenticationFailed).toBe(true)
    connectImapAccount.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await expect(restoreToImap('acc-1', ['a'])).rejects.toThrow('ECONNREFUSED')
  })
})

describe('POST /:accountId/mails/restore-mailbox', () => {
  async function post(account: unknown, mailIds: unknown = ['00000000-0000-4000-8000-000000000001'], route = 'restore-mailbox') {
    answer = () => (account ? [account] : [])
    const app = Fastify()
    app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
    app.decorate('requireAccountOwnership', async () => {})
    app.decorate('requireAdmin', async () => {})
    await app.register(archiveRoutes)
    const res = await app.inject({ method: 'POST', url: `/acc-1/mails/${route}`, payload: { mailIds } })
    await app.close()
    return res
  }

  it.each([['gmail', 'restore_gmail'], ['imap', 'restore_imap']])('queues the %s restore and audits it', async (provider, type) => {
    const res = await post({ provider, is_active: true, auth_error_at: null })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ jobId: 'job-r' })
    expect(enqueueJob).toHaveBeenCalledWith(type, { accountId: 'acc-1', userId: 'u1', mailIds: ['00000000-0000-4000-8000-000000000001'] })
    expect(logAudit).toHaveBeenCalledWith('u1', `archive.${type}`, expect.objectContaining({ details: { count: 1 } }))
  })

  it('keeps the former restore-gmail route', async () => {
    expect((await post({ provider: 'imap', is_active: true, auth_error_at: null }, undefined, 'restore-gmail')).statusCode).toBe(202)
    expect(enqueueJob).toHaveBeenCalledWith('restore_imap', expect.anything())
  })

  it('refuses an account to reconnect, an unknown account, an empty selection', async () => {
    expect((await post({ provider: 'imap', is_active: true, auth_error_at: new Date() })).json()).toEqual({ error: 'Account must be reconnected first' })
    expect((await post({ provider: 'gmail', is_active: false, auth_error_at: null })).statusCode).toBe(409)
    expect((await post(undefined)).statusCode).toBe(404)
    expect((await post({ provider: 'gmail', is_active: true, auth_error_at: null }, [])).statusCode).not.toBe(202)
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})
