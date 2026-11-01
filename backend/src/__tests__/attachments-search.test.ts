// /api/attachments/:id/archived?q= : name, subject, sender, or the attachment's text (indexed expression of migration 023)
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

const seen: CompiledQuery[] = []
let answer: (sql: string) => unknown[] = () => []
const fakeDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => { seen.push(q); return { rows: answer(q.sql) } },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => fakeDb }))

import Fastify from 'fastify'
import { attachmentsRoutes } from '../routes/attachments'

async function get(url: string) {
  const app = Fastify()
  app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1' } })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  await app.register(attachmentsRoutes)
  const res = await app.inject({ method: 'GET', url })
  await app.close()
  return res
}

beforeEach(() => { seen.length = 0 })

it('searches the text of PDF/DOCX too, with the indexed expression, and returns a safe excerpt', async () => {
  answer = (sql) => {
    if (sql.includes('count(*)')) return [{ count: '2' }]
    if (sql.includes('sum(')) return [{ total_size: '10' }]
    return [
      { id: 'a1', filename: 'avis.pdf', highlight: 'revenu \u0001imposable\u0002 <b>' },
      { id: 'a2', filename: 'imposable.png', highlight: null },
    ]
  }
  const res = await get('/acc-1/archived?q=%20imposable%20')
  expect(res.statusCode).toBe(200)
  expect(res.json().attachments).toEqual([
    { id: 'a1', filename: 'avis.pdf', highlight: 'revenu <mark>imposable</mark> &lt;b&gt;' },
    { id: 'a2', filename: 'imposable.png', highlight: null },
  ])
  const tsv = `to_tsvector('nid_french', COALESCE(archived_attachments.text_content, '')) @@ websearch_to_tsquery('nid_french', $`
  const [list, count] = [seen[0], seen.find((q) => q.sql.includes('count(*)'))!]
  for (const q of [list, count]) {
    expect(q.sql).toContain('"archived_attachments"."filename" ilike $')
    expect(q.sql).toContain('archived_attachments.id IN (SELECT archived_attachments.id FROM archived_attachments WHERE ' + tsv)
    expect(q.parameters).toEqual(expect.arrayContaining(['%imposable%', 'imposable']))
  }
  expect(list.sql).toContain('CASE WHEN ' + tsv)
  expect(list.sql).toContain("THEN ts_headline('nid_french', archived_attachments.text_content")
})

it('without q: no text search, no excerpt', async () => {
  answer = (sql) => (sql.includes('count(*)') ? [{ count: '0' }] : sql.includes('sum(') ? [{ total_size: null }] : [])
  await get('/acc-1/archived')
  expect(seen.some((q) => q.sql.includes('to_tsvector') || q.sql.includes('ts_headline'))).toBe(false)
})
