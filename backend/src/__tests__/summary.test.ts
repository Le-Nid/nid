import Fastify from 'fastify'

const mockExecute = vi.fn()
const mockTakeFirstOrThrow = vi.fn()
const wheres: unknown[][] = []
// Callable chain that also runs the builder callbacks (join, select, filterWhere) so their code is exercised:
// every property is itself a callable chain (eb.fn.countAll(), f.and([...]), eb('col', 'is', null)…)
const handler: ProxyHandler<any> = {
  apply: () => chain,
  get: (_t, prop) => {
    if (prop === 'then') return undefined
    if (prop === 'execute') return mockExecute
    if (prop === 'executeTakeFirstOrThrow') return mockTakeFirstOrThrow
    return new Proxy(function () {}, {
      ...handler,
      apply: (_f, _this, args: unknown[]) => {
        if (prop === 'where') wheres.push(args)
        for (const arg of args) if (typeof arg === 'function') arg(chain)
        return chain
      },
    })
  },
}
const chain: any = new Proxy(function () {}, handler)
vi.mock('../db', () => ({ getDb: () => new Proxy({}, { get: () => () => chain }) }))

import { summaryRoutes } from '../routes/summary'

beforeEach(() => {
  vi.clearAllMocks()
  wheres.length = 0
})

async function get() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => { request.user = { sub: 'u1', email: 'ana@test.com', role: 'user' } })
  await app.register(summaryRoutes)
  return app.inject({ method: 'GET', url: '/' })
}

describe('GET /api/summary', () => {
  it('returns plain numbers per account and in total, scoped to the caller', async () => {
    mockTakeFirstOrThrow
      .mockResolvedValueOnce({ storage_quota_bytes: '5368709120' })
      .mockResolvedValueOnce({ active: '2', failed_24h: '1' })
      .mockResolvedValueOnce({ count: '7' })
    mockExecute.mockResolvedValueOnce([
      { id: 'a1', email: 'ana@gmail.com', is_active: true, needs_reauth: true, last_backup_at: null, archived_mails: '10', archived_bytes: '2048', last_archived_at: null },
      { id: 'a2', email: 'pro@gmail.com', is_active: true, needs_reauth: false, last_backup_at: null, archived_mails: '0', archived_bytes: '0', last_archived_at: null },
    ])
    const res = await get()

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      needs_reauth: 1, archived_mails: 10, archived_bytes: 2048, storage_quota_bytes: 5368709120,
      jobs: { active: 2, failed_24h: 1 }, unread_notifications: 7,
    })
    expect(body.accounts[0]).toMatchObject({ email: 'ana@gmail.com', needs_reauth: true, archived_mails: 10, archived_bytes: 2048 })
    expect(wheres).toEqual(expect.arrayContaining([['id', '=', 'u1'], ['gmail_accounts.user_id', '=', 'u1'], ['user_id', '=', 'u1']]))
  })

  it('works with no account at all', async () => {
    mockTakeFirstOrThrow.mockResolvedValueOnce({ storage_quota_bytes: '1' }).mockResolvedValueOnce({ active: '0', failed_24h: '0' }).mockResolvedValueOnce({ count: '0' })
    mockExecute.mockResolvedValueOnce([])
    expect((await get()).json()).toMatchObject({ accounts: [], needs_reauth: 0, archived_mails: 0, archived_bytes: 0 })
  })
})
