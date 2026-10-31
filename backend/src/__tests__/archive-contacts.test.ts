import Fastify from 'fastify'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'
import { listArchiveContacts } from '../archive/contacts.service'

// A Kysely that compiles real SQL and answers each query with `rows`
function fakeDb(rows: unknown[], seen: CompiledQuery[] = []) {
  return new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => Object.assign(new DummyDriver(), {
        acquireConnection: async () => ({
          executeQuery: async (q: CompiledQuery) => { seen.push(q); return { rows } },
          streamQuery: async function* () {},
        }),
      }),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  })
}

const ROW = { email: 'bob@x.fr', name: 'Bob', from_count: 2, to_count: 1, last_at: '2026-02-01', total: '7' }

describe('listArchiveContacts', () => {
  it('returns the page and the total, without the window column', async () => {
    const seen: CompiledQuery[] = []
    const res = await listArchiveContacts(fakeDb([ROW], seen), 'acc-1', { q: ' 50%_ ', limit: 10, offset: 20 })
    expect(res).toEqual({ total: 7, contacts: [{ email: 'bob@x.fr', name: 'Bob', from_count: 2, to_count: 1, last_at: '2026-02-01' }] })
    expect(seen[0].parameters).toEqual(expect.arrayContaining(['acc-1', String.raw`%50\%\_%`, 10, 20]))
  })

  it('no row: total 0, no search term', async () => {
    const seen: CompiledQuery[] = []
    expect(await listArchiveContacts(fakeDb([], seen), 'acc-1', { limit: 50, offset: 0 })).toEqual({ contacts: [], total: 0 })
    expect(seen[0].parameters).toContain(null)
  })
})

describe('GET /:accountId/contacts', () => {
  it('pages through the service', async () => {
    vi.resetModules()
    const list = vi.fn().mockResolvedValue({ contacts: [{ email: 'bob@x.fr' }], total: 1 })
    vi.doMock('../archive/contacts.service', () => ({ listArchiveContacts: list }))
    vi.doMock('../db', () => ({ getDb: () => ({}) }))
    const { archiveRoutes } = await import('../routes/archive')
    const app = Fastify()
    app.decorate('authenticate', async () => {})
    app.decorate('requireAccountOwnership', async () => {})
    app.decorate('requireAdmin', async () => {})
    await app.register(archiveRoutes)
    const res = await app.inject({ url: '/acc-1/contacts?q=bob&page=2&limit=20' })
    expect(res.json()).toEqual({ contacts: [{ email: 'bob@x.fr' }], total: 1, page: 2, limit: 20 })
    expect(list).toHaveBeenCalledWith({}, 'acc-1', { q: 'bob', limit: 20, offset: 20 })
    await app.close()
  })
})
