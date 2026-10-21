import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'
import {
  Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler,
  type CompiledQuery, type DatabaseConnection, type Driver,
} from 'kysely'

// ─── Real Kysely compiler, fake connection: assert the SQL actually sent ─────
const queries: CompiledQuery[] = []
let respond: (q: CompiledQuery) => unknown[] = () => []
const connection: DatabaseConnection = {
  executeQuery: async (q) => {
    queries.push(q)
    return { rows: respond(q) as any[] }
  },
  streamQuery: async function* () { /* unused */ },
}
const driver: Driver = {
  init: async () => {},
  acquireConnection: async () => connection,
  beginTransaction: async () => {},
  commitTransaction: async () => {},
  rollbackTransaction: async () => {},
  releaseConnection: async () => {},
  destroy: async () => {},
}
const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => testDb }))

const readFile = vi.fn()
vi.mock('../storage/storage.service', () => ({
  getLocalStorage: () => ({ readFile, deleteFile: vi.fn() }),
}))
vi.mock('../archive/export.service', () => ({ streamArchiveZip: vi.fn() }))
vi.mock('../dashboard/cache.service', () => ({ invalidateDashboardCache: vi.fn() }))

import {
  extractBodyText, bodyTextFromParsed, highlightToHtml, backfillBodyText, countPendingBodyText,
} from '../archive/body-text'
import { archiveRoutes } from '../routes/archive'
import { encryptArchives } from '../privacy/encryption.service'
import { enqueueBodyTextBackfill } from '../jobs/scheduler'
import { enqueueJob } from '../jobs/queue'

const eml = (headers: string, body: string) => Buffer.from(`From: a@b.c\r\nSubject: s\r\n${headers}\r\n\r\n${body}`)

beforeEach(() => {
  queries.length = 0
  respond = () => []
  vi.clearAllMocks()
})

// ─── extractBodyText ────────────────────────────────────────
describe('extractBodyText', () => {
  it('returns the text/plain part with whitespace collapsed', async () => {
    const text = await extractBodyText(eml('Content-Type: text/plain; charset=utf-8', 'Bonjour,\r\n\r\n  votre   facture EDF\r\nest prête.'))
    expect(text).toBe('Bonjour, votre facture EDF est prête.')
  })

  it('derives text from an HTML-only mail', async () => {
    const text = await extractBodyText(eml('Content-Type: text/html; charset=utf-8', '<html><body><p>Votre <b>colis</b></p><p>arrive</p></body></html>'))
    expect(text).toContain('colis')
    expect(text).toContain('arrive')
    expect(text).not.toMatch(/<[a-z/]/i)
  })

  it('strips HTML itself when mailparser gives no text', () => {
    expect(bodyTextFromParsed({ text: '  ', html: '<p>Hello <b>world</b></p>' })).toBe('Hello world')
    expect(bodyTextFromParsed({ text: undefined, html: false })).toBe('')
  })

  it('removes NUL and ts_headline marker characters', () => {
    expect(bodyTextFromParsed({ text: 'a\u0000b \u0001c\u0002', html: false })).toBe('ab c')
  })

  it('truncates to 100 000 chars', async () => {
    const text = await extractBodyText(eml('Content-Type: text/plain', 'x'.repeat(150_000)))
    expect(text).toHaveLength(100_000)
  })

  it('never throws: garbage gives a string, a parse failure gives ""', async () => {
    expect(typeof (await extractBodyText(Buffer.from([0xff, 0x00, 0x13, 0x37])))).toBe('string')
    expect(await extractBodyText(null as unknown as Buffer)).toBe('')
  })
})

// ─── highlight escaping ─────────────────────────────────────
describe('highlightToHtml', () => {
  it('escapes everything and only emits <mark>', async () => {
    const body = await extractBodyText(eml('Content-Type: text/plain', '<script>alert("x")</script> votre facture & co'))
    // what ts_headline returns: the body with \x01/\x02 around the match
    const html = highlightToHtml(body.replace('facture', '\u0001facture\u0002'))
    expect(html).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; votre <mark>facture</mark> &amp; co')
    expect(html.replaceAll(/<\/?mark>/g, '')).not.toMatch(/[<>]/)
  })
})

// ─── Backfill ───────────────────────────────────────────────
describe('backfillBodyText', () => {
  it('fills each batch, writes "" for a missing file, stops when no rows remain', async () => {
    let selects = 0
    respond = (q) => {
      if (!q.sql.startsWith('select')) return []
      selects++
      return selects === 1 ? [{ id: 'a', eml_path: '/ok.eml' }, { id: 'b', eml_path: '/missing.eml' }] : []
    }
    readFile.mockImplementation(async (p: string) => {
      if (p === '/ok.eml') return eml('Content-Type: text/plain', 'corps du mail')
      throw new Error('ENOENT')
    })
    const onProgress = vi.fn().mockResolvedValue(undefined)

    expect(await backfillBodyText(onProgress)).toBe(2)

    const select = queries[0]
    expect(select.sql).toContain('"body_text" is null')
    expect(select.sql).toContain('"is_encrypted" = $')
    expect(select.parameters).toContain(false)
    const updates = queries.filter((q) => q.sql.startsWith('update'))
    expect(updates.map((u) => u.parameters[0])).toEqual(['corps du mail', ''])
    // the update itself refuses a mail encrypted in the meantime
    expect(updates[0].sql).toContain('"is_encrypted" = $')
    expect(onProgress).toHaveBeenCalledWith(2)
    expect(selects).toBe(2)
  })

  it('does nothing when nothing is pending', async () => {
    expect(await backfillBodyText()).toBe(0)
    expect(queries).toHaveLength(1)
  })

  it('counts pending rows', async () => {
    respond = () => [{ count: '7' }]
    expect(await countPendingBodyText()).toBe(7)
  })
})

describe('enqueueBodyTextBackfill (scheduler startup)', () => {
  it('enqueues one deduplicated backfill when rows remain', async () => {
    respond = () => [{ count: '3' }]
    await enqueueBodyTextBackfill()
    expect(enqueueJob).toHaveBeenCalledWith('backfill_body_text', { accountId: '' }, { dedupId: 'backfill_body_text' })
  })

  it('skips when nothing remains, and swallows DB errors', async () => {
    respond = () => [{ count: '0' }]
    await enqueueBodyTextBackfill()
    respond = () => { throw new Error('db down') }
    await enqueueBodyTextBackfill()
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})

// ─── Encryption clears body_text ────────────────────────────
describe('encryptArchives', () => {
  it('sets body_text to NULL when a mail becomes encrypted', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nid-bt-'))
    const file = path.join(dir, 'm.eml')
    await fs.writeFile(file, 'secret body')
    respond = (q) => (q.sql.includes('from "archived_mails"') ? [{ id: 'm1', eml_path: file }] : [])

    await encryptArchives('acc-1', 'passphrase')

    const update = queries.find((q) => q.sql.startsWith('update "archived_mails"'))!
    expect(update.sql).toMatch(/"is_encrypted" = \$1, "body_text" = \$2/)
    expect(update.parameters.slice(0, 2)).toEqual([true, null])
    await fs.rm(dir, { recursive: true, force: true })
  })
})

// ─── Search route ───────────────────────────────────────────
async function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => { request.user = { sub: 'user-1', role: 'user' } })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  // same contract as the global handler in plugins/index.ts
  app.setErrorHandler((err: Error, _req, reply) => reply.code(err.name === 'ZodError' ? 400 : 500).send({ error: err.message }))
  await app.register(archiveRoutes)
  await app.ready()
  return app
}

describe('GET /:accountId/mails', () => {
  it('applies every filter to both the page and the total, with highlight and tookMs', async () => {
    respond = (q) => q.sql.includes('count(*)')
      ? [{ count: '3' }]
      : [{ id: 'm1', subject: 'Facture', highlight: '<script>x</script> \u0001facture\u0002' }]
    const app = await buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?q=%20facture%20&sender=edf&from_date=2024-01-01&to_date=2024-12-31&has_attachments=true&label=Label_7&page=2&limit=10',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ total: 3, page: 2, limit: 10 })
    expect(Number.isInteger(body.tookMs)).toBe(true)
    expect(body.mails[0].highlight).toBe('&lt;script&gt;x&lt;/script&gt; <mark>facture</mark>')

    const [list, count] = [queries.find((q) => !q.sql.includes('count(*)'))!, queries.find((q) => q.sql.includes('count(*)'))!]
    for (const q of [list, count]) {
      expect(q.sql).toContain('"deleted_at" is null')
      expect(q.sql).toContain('"sender" ilike')
      expect(q.sql).toContain('"has_attachments" =')
      expect(q.sql).toContain('label_ids @> ARRAY[')
      expect(q.sql).toContain("search_vector @@ plainto_tsquery('french'")
      expect(q.parameters).toEqual(expect.arrayContaining(['acc-1', '%edf%', 'Label_7', 'facture', true]))
    }
    expect(list.sql).toContain('ts_headline')
    expect(list.sql).toContain('ts_rank')
    expect(list.sql).not.toMatch(/\bbody_text"|"search_vector"|select \*/)
    expect(list.parameters).toEqual(expect.arrayContaining([10, 10]))
    await app.close()
  })

  it('without q: no highlight, no ranking, plain date order', async () => {
    respond = (q) => (q.sql.includes('count(*)') ? [{ count: '1' }] : [{ id: 'm1' }])
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/acc-1/mails?q=%20%20' })
    expect(res.statusCode).toBe(200)
    expect(res.json().mails[0]).toEqual({ id: 'm1' })
    expect(queries.some((q) => q.sql.includes('ts_headline') || q.sql.includes('plainto_tsquery'))).toBe(false)
    await app.close()
  })

  it.each([
    'has_attachments=yes', 'from_date=not-a-date', 'page=0', 'limit=-5', 'label=',
  ])('rejects invalid query %s', async (qs) => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: `/acc-1/mails?${qs}` })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('detail and thread responses omit body_text', async () => {
    respond = (q) => (q.sql.includes('"archived_attachments"') ? [] : [{ id: 'm1', eml_path: '/nope', body_text: 'heavy' }])
    const app = await buildApp()
    const detail = await app.inject({ method: 'GET', url: '/acc-1/mails/m1' })
    expect(detail.json()).not.toHaveProperty('body_text')
    const thread = await app.inject({ method: 'GET', url: '/acc-1/threads/t1' })
    expect(thread.json()[0]).not.toHaveProperty('body_text')
    await app.close()
  })
})

// ─── Migration 007 ──────────────────────────────────────────
describe('migration 007_archive_body_text', () => {
  it('up adds the column and weights the body D; down restores the previous trigger', async () => {
    const m = await import('../db/migrations/007_archive_body_text')
    await m.up(testDb)
    expect(queries[0].sql).toBe('alter table "archived_mails" add column "body_text" text')
    expect(queries[1].sql).toContain("setweight(to_tsvector('french', COALESCE(NEW.body_text, '')), 'D')")
    queries.length = 0
    await m.down(testDb)
    expect(queries[0].sql).not.toContain('body_text')
    expect(queries[0].sql).toContain("COALESCE(NEW.attachment_names, '')), 'B');")
    expect(queries[1].sql).toBe('alter table "archived_mails" drop column "body_text"')
  })
})
