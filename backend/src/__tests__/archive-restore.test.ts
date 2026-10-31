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
vi.mock('node:fs', () => ({ default: { createReadStream: vi.fn((p: string) => `stream:${p}`) } }))

vi.mock('../jobs/queue', () => ({ enqueueJob: vi.fn(async () => ({ id: 'job-r' })) }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

import Fastify from 'fastify'
import { restoreToGmail } from '../archive/restore.service'
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

describe('POST /:accountId/mails/restore-gmail', () => {
  async function post(account: unknown, mailIds: unknown = ['00000000-0000-4000-8000-000000000001']) {
    answer = () => (account ? [account] : [])
    const app = Fastify()
    app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
    app.decorate('requireAccountOwnership', async () => {})
    app.decorate('requireAdmin', async () => {})
    await app.register(archiveRoutes)
    const res = await app.inject({ method: 'POST', url: '/acc-1/mails/restore-gmail', payload: { mailIds } })
    await app.close()
    return res
  }

  it('queues the restore and audits it', async () => {
    const res = await post({ provider: 'gmail', is_active: true, auth_error_at: null })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ jobId: 'job-r' })
    expect(enqueueJob).toHaveBeenCalledWith('restore_gmail', { accountId: 'acc-1', userId: 'u1', mailIds: ['00000000-0000-4000-8000-000000000001'] })
    expect(logAudit).toHaveBeenCalledWith('u1', 'archive.restore_gmail', expect.objectContaining({ details: { count: 1 } }))
  })

  it('refuses an IMAP account, an account to reconnect, an empty selection', async () => {
    expect((await post({ provider: 'imap', is_active: true, auth_error_at: null })).statusCode).toBe(409)
    expect((await post({ provider: 'gmail', is_active: true, auth_error_at: new Date() })).json()).toEqual({ error: 'Gmail account must be reconnected first' })
    expect((await post(undefined)).statusCode).toBe(409)
    expect((await post({ provider: 'gmail', is_active: true, auth_error_at: null }, [])).statusCode).not.toBe(202)
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})
