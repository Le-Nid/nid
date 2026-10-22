import Fastify from 'fastify'

// ─── Admin > Système / Audit (B13–B15): instance quota, audit, trash ─────

const calls: { method: string; args: unknown[] }[] = []
const mockExecute = vi.fn().mockResolvedValue([])
const mockExecuteTakeFirst = vi.fn()
const chainable = (): any => {
  const chain: any = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      return (...args: unknown[]) => {
        calls.push({ method: prop, args })
        return chain
      }
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockQuota = vi.fn()
vi.mock('../gmail/quota.service', () => ({ getInstanceQuotaStats: () => mockQuota() }))
const mockSummary = vi.fn()
const mockEmpty = vi.fn()
vi.mock('../archive/trash.service', () => ({
  getArchiveTrashSummary: () => mockSummary(),
  emptyAllArchiveTrash: () => mockEmpty(),
}))
const mockLastCheck = vi.fn()
vi.mock('../archive/integrity.service', () => ({ getLastIntegrityCheck: () => mockLastCheck() }))
const mockLogAudit = vi.fn()
vi.mock('../audit/audit.service', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a) }))

async function buildApp(role: 'admin' | 'user' = 'admin') {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'admin-1', role }
  })
  app.decorate('requireAdmin', async (request: any, reply: any) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  })
  const { adminRoutes } = await import('../routes/admin')
  await app.register(adminRoutes)
  await app.ready()
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
})

describe('admin instance routes', () => {
  it.each([
    ['GET', '/quota'], ['GET', '/audit'], ['GET', '/system'], ['DELETE', '/archive-trash'],
  ] as const)('%s %s is refused to a non-admin', async (method, url) => {
    const app = await buildApp('user')
    const res = await app.inject({ method, url })
    expect(res.statusCode).toBe(403)
    expect(mockEmpty).not.toHaveBeenCalled()
    await app.close()
  })

  it('GET /quota returns the instance aggregate', async () => {
    mockQuota.mockResolvedValue({ day: { units: 10, calls: 2, limit: 1 }, peakPerSecond: { units: 5, account: 'a@x', limit: 250 }, rateLimited24h: 3 })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/quota' })
    expect(res.statusCode).toBe(200)
    expect(res.json().rateLimited24h).toBe(3)
    await app.close()
  })

  it('GET /audit filters by user email and action, paginates and lists the actions', async () => {
    mockExecute
      .mockResolvedValueOnce([{ id: 'l1', action: 'rule.create', user_email: 'bob@x' }])
      .mockResolvedValueOnce([{ action: 'rule.create' }, { action: 'user.login' }])
    mockExecuteTakeFirst.mockResolvedValueOnce({ count: '41' })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/audit?user=bob_&action=rule.create&page=3&limit=20' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      logs: [{ id: 'l1', action: 'rule.create', user_email: 'bob@x' }],
      total: 41, page: 3, limit: 20, actions: ['rule.create', 'user.login'],
    })
    const wheres = calls.filter((c) => c.method === 'where').map((c) => c.args)
    expect(wheres).toContainEqual(['users.email', 'ilike', '%bob\\_%'])
    expect(wheres).toContainEqual(['audit_logs.action', '=', 'rule.create'])
    expect(calls).toContainEqual({ method: 'offset', args: [40] })
    await app.close()
  })

  it('GET /audit without filters adds no where clause', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/audit' })
    expect(res.json().total).toBe(0)
    expect(calls.some((c) => c.method === 'where')).toBe(false)
    await app.close()
  })

  it('GET /audit rejects an oversized filter', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: `/audit?action=${'a'.repeat(65)}` })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    await app.close()
  })

  it('GET /system returns the trash summary and the last integrity check', async () => {
    mockSummary.mockResolvedValue({ count: 2, sizeBytes: 10, retentionDays: 30, purgeEnabled: true, nextPurgeAt: null })
    mockLastCheck.mockResolvedValue(null)
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/system' })
    expect(res.json()).toEqual({ trash: { count: 2, sizeBytes: 10, retentionDays: 30, purgeEnabled: true, nextPurgeAt: null }, integrity: null })
    await app.close()
  })

  it('DELETE /archive-trash empties every trash and audits the counts', async () => {
    mockEmpty.mockResolvedValue({ deleted: 7, sizeBytes: 700 })
    const app = await buildApp()
    const res = await app.inject({ method: 'DELETE', url: '/archive-trash' })
    expect(res.json()).toEqual({ deleted: 7, sizeBytes: 700 })
    expect(mockLogAudit).toHaveBeenCalledWith('admin-1', 'admin.empty_archive_trash', expect.objectContaining({ details: { deleted: 7, sizeBytes: 700 } }))
    await app.close()
  })
})
