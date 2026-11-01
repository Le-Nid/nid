// Both archive pipelines store each attachment's text; a copy already archived (same bytes) reuses it
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

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
vi.mock('node:fs/promises', () => ({ default: { mkdir: vi.fn(), writeFile: vi.fn() } }))
const extract = vi.fn(async (name: string) => (name.endsWith('.pdf') ? `texte de ${name}` : null))
vi.mock('../archive/attachment-text', () => ({ extractAttachmentText: (name: string) => extract(name) }))
const raw = vi.hoisted(() => ({ value: '' }))
vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: async () => ({ users: { messages: { get: async () => ({ data: { raw: Buffer.from(raw.value).toString('base64url'), labelIds: [] } }) } } }),
}))
vi.mock('../gmail/gmail-throttle', () => ({ gmailRetry: (fn: () => unknown) => fn() }))
vi.mock('../gmail/quota.service', () => ({ trackApiCall: vi.fn(async () => {}) }))

import { archiveMail } from '../archive/archive.service'
import { importSingleEml } from '../archive/import.service'

const EML = [
  'Message-ID: <m1@x>', 'Subject: Avis', 'From: a@b.c', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary=B', '',
  '--B', 'Content-Type: text/plain', '', 'corps', '',
  '--B', 'Content-Type: application/pdf; name=avis.pdf', 'Content-Disposition: attachment; filename=avis.pdf', 'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-avis').toString('base64'), '',
  '--B', 'Content-Type: image/png; name=logo.png', 'Content-Disposition: attachment; filename=logo.png', 'Content-Transfer-Encoding: base64', '', Buffer.from('png').toString('base64'), '',
  '--B--', '',
].join('\r\n')
const attachmentInsert = () => seen.find((q) => q.sql.startsWith('insert into "archived_attachments"'))!

beforeEach(() => { vi.clearAllMocks(); seen.length = 0; raw.value = EML })

it('archiveMail extracts new attachments, reuses the text of a copy already archived', async () => {
  answer = (sql) => {
    if (sql.includes('"archived_attachments"."content_hash"')) return seen.filter((q) => q.sql.includes('content_hash')).length === 1 ? [{ file_path: '/nas/old.pdf', text_content: 'texte déjà extrait' }] : []
    if (sql.startsWith('insert into "archived_mails"')) return [{ id: 'mail-1' }]
    return []
  }
  await archiveMail('acc-1', 'g1')
  // avis.pdf: same bytes as an archived copy → its text, no extraction; logo.png: extracted (null, not a text type)
  expect(extract.mock.calls.map((c) => c[0])).toEqual(['logo.png'])
  const ins = attachmentInsert()
  expect(ins.sql).toContain('"text_content"')
  expect(ins.parameters).toEqual(expect.arrayContaining(['avis.pdf', '/nas/old.pdf', 'texte déjà extrait', 'logo.png', null]))
})

it('importSingleEml (mbox, .eml, IMAP) deduplicates like a Gmail backup: hash stored, a copy reuses file and text', async () => {
  answer = (sql) => {
    if (sql.includes('"archived_attachments"."content_hash"')) return seen.filter((q) => q.sql.includes('content_hash')).length === 2 ? [{ file_path: '/nas/old.png', text_content: null }] : []
    if (sql.startsWith('insert into "archived_mails"')) return [{ id: 'mail-1' }]
    return []
  }
  const storage = { mkdir: vi.fn(), writeFile: vi.fn() } as any
  expect(await importSingleEml(fakeDb as any, storage, 'acc-1', Buffer.from(EML))).toBe('imported')
  const ins = attachmentInsert()
  expect(ins.sql).toContain('"content_hash"')
  // avis.pdf is new: written and read; logo.png is already archived: its file, no write
  expect(ins.parameters).toEqual(expect.arrayContaining(['avis.pdf', 'texte de avis.pdf', 'logo.png', '/nas/old.png']))
  expect(ins.parameters.filter((p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p))).toHaveLength(2)
  const { default: fs } = await import('node:fs/promises')
  expect(vi.mocked(fs.writeFile).mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/0_avis\.pdf$/)])
})
