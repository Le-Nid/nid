import Fastify from 'fastify'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

// Real SQL compiled; each query answered by `answer(sql)`
const seen: CompiledQuery[] = []
let answer: (sql: string) => { rows?: unknown[]; deleted?: bigint } = () => ({})
const fakeDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => {
          seen.push(q)
          const a = answer(q.sql)
          return { rows: a.rows ?? [], numAffectedRows: a.deleted ?? 0n }
        },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => fakeDb }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

import { accountAccess } from '../plugins/index'
import { accountShareRoutes } from '../routes/account-shares'
import { logAudit } from '../audit/audit.service'

const ACC = '00000000-0000-4000-8000-0000000000aa'
const FRIEND = '00000000-0000-4000-8000-0000000000bb'

beforeEach(() => { vi.clearAllMocks(); seen.length = 0 })

describe('accountAccess', () => {
  const row = (owner: string, viewer: string | null) => { answer = () => ({ rows: [{ owner, viewer }] }) }
  it('the owner may do anything', async () => {
    row('me', null)
    expect(await accountAccess(fakeDb, 'me', ACC, 'DELETE', '/api/rules/:accountId/:ruleId')).toBe(true)
  })
  it('a user it is shared with only reads the archive', async () => {
    row('owner', 'me')
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/archive/:accountId/mails')).toBe(true)
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/labels/:accountId')).toBe(true)
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/gmail/:accountId/messages')).toBe(false)
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/archive/:accountId/trash')).toBe(false)
    expect(await accountAccess(fakeDb, 'me', ACC, 'POST', '/api/archive/:accountId/mails/trash')).toBe(false)
  })
  it('anyone else, or an unknown account: refused', async () => {
    row('owner', null)
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/archive/:accountId/mails')).toBe(false)
    answer = () => ({ rows: [] })
    expect(await accountAccess(fakeDb, 'me', ACC, 'GET', '/api/archive/:accountId/mails')).toBe(false)
  })
})

describe('accountShareRoutes', () => {
  async function app() {
    const a = Fastify()
    a.decorate('authenticate', async (req: any) => { req.user = { sub: 'me' } })
    a.decorate('requireAccountOwnership', async () => {})
    a.decorate('requireAdmin', async () => {})
    await a.register(accountShareRoutes)
    return a
  }
  // owns: the owner check answers; user: the user looked up by email; inserted: the share row
  function db({ owns = true, user = { id: FRIEND, email: 'ami@example.com', display_name: 'Ami' } as unknown, inserted = true, deleted = 1n } = {}) {
    answer = (sql) => {
      if (sql.startsWith('select "id" from "mail_accounts"')) return { rows: owns ? [{ id: ACC }] : [] }
      if (sql.includes('from "users"') && sql.includes('lower')) return { rows: user ? [user] : [] }
      if (sql.startsWith('insert into "account_shares"')) return { rows: inserted ? [{ created_at: '2026-10-31' }] : [] }
      if (sql.startsWith('delete from "account_shares"')) return { deleted }
      if (sql.includes('from "account_shares"')) return { rows: [{ user_id: FRIEND, email: 'ami@example.com' }] }
      return {}
    }
  }

  it('lists, adds by email (audited), refuses duplicates, self, unknown users and non-owners', async () => {
    const a = await app()
    db()
    expect((await a.inject({ url: `/${ACC}/shares` })).json()).toEqual([{ user_id: FRIEND, email: 'ami@example.com' }])
    const res = await a.inject({ method: 'POST', url: `/${ACC}/shares`, payload: { email: ' Ami@Example.com ' } })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ user_id: FRIEND, email: 'ami@example.com', display_name: 'Ami', created_at: '2026-10-31' })
    expect(logAudit).toHaveBeenCalledWith('me', 'account.share', expect.objectContaining({ details: { with: 'ami@example.com' } }))
    db({ inserted: false })
    expect((await a.inject({ method: 'POST', url: `/${ACC}/shares`, payload: { email: 'ami@example.com' } })).statusCode).toBe(409)
    db({ user: { id: 'me', email: 'me@example.com' } })
    expect((await a.inject({ method: 'POST', url: `/${ACC}/shares`, payload: { email: 'me@example.com' } })).statusCode).toBe(400)
    db({ user: null })
    expect((await a.inject({ method: 'POST', url: `/${ACC}/shares`, payload: { email: 'x@example.com' } })).statusCode).toBe(404)
    db({ owns: false })
    expect((await a.inject({ url: `/${ACC}/shares` })).statusCode).toBe(404)
    expect((await a.inject({ method: 'POST', url: `/${ACC}/shares`, payload: { email: 'ami@example.com' } })).statusCode).toBe(404)
    await a.close()
  })

  it('the owner revokes; the user it was shared with leaves; anyone else gets 404', async () => {
    const a = await app()
    db()
    expect((await a.inject({ method: 'DELETE', url: `/${ACC}/shares/${FRIEND}` })).statusCode).toBe(204)
    expect(logAudit).toHaveBeenCalledWith('me', 'account.unshare', expect.anything())
    db({ owns: false, deleted: 0n })
    expect((await a.inject({ method: 'DELETE', url: `/${ACC}/shares/${FRIEND}` })).statusCode).toBe(404)
    await a.close()
  })
})
