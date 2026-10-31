import Fastify from 'fastify'
import crypto from 'node:crypto'

const mockExecute = vi.fn()
const mockTakeFirst = vi.fn()
const mockTakeFirstOrThrow = vi.fn()
const writes: { op: string; table: string; values?: any }[] = []
const chainable = (op: string, table: string): any => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockTakeFirstOrThrow
      if (prop === 'values' || prop === 'set') return (values: any) => { writes.push({ op, table, values }); return chain }
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: (_t, op: string) => (table: string) => chainable(op, table) })
vi.mock('../db', () => ({ getDb: () => mockDb }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

import { apiTokenRoutes } from '../routes/api-tokens'
import { API_TOKEN_RE, hashApiToken } from '../auth/api-tokens.service'
import { logAudit } from '../audit/audit.service'

const ID = '3f1c2a7e-8a4b-4c1d-9e2f-0123456789ab'

beforeEach(() => {
  vi.clearAllMocks()
  writes.length = 0
})

async function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'ana@test.com', role: 'user' }
  })
  await app.register(apiTokenRoutes)
  await app.ready()
  return app
}

describe('POST / (create)', () => {
  it('returns the token once and stores only its SHA-256', async () => {
    mockTakeFirstOrThrow
      .mockResolvedValueOnce({ count: '0' })
      .mockImplementationOnce(async () => ({ id: ID, name: 'Home Assistant', scope: 'read', expires_at: null, last_used_at: null, created_at: new Date() }))
    const res = await (await buildApp()).inject({ method: 'POST', url: '/', payload: { name: ' Home Assistant ' } })

    expect(res.statusCode).toBe(201)
    const { token, ...rest } = res.json()
    expect(token).toMatch(API_TOKEN_RE)
    expect(rest).toMatchObject({ id: ID, scope: 'read' })
    const stored = writes.find((w) => w.table === 'api_tokens')!.values
    expect(stored).toMatchObject({ user_id: 'user-1', name: 'Home Assistant', scope: 'read', expires_at: null })
    expect(stored.token_hash).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(logAudit).toHaveBeenCalledWith('user-1', 'user.api_token_create', expect.objectContaining({ targetId: ID }))
  })

  it('sets the expiry from expires_in_days', async () => {
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '0' }).mockResolvedValueOnce({ id: ID })
    await (await buildApp()).inject({ method: 'POST', url: '/', payload: { name: 'ha', scope: 'write', expires_in_days: 30 } })
    const { expires_at, scope } = writes.find((w) => w.table === 'api_tokens')!.values
    expect(scope).toBe('write')
    expect(Math.round((expires_at.getTime() - Date.now()) / 86_400_000)).toBe(30)
  })

  it('caps the number of tokens per user', async () => {
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '20' })
    const res = await (await buildApp()).inject({ method: 'POST', url: '/', payload: { name: 'one more' } })
    expect(res.statusCode).toBe(409)
    expect(writes).toHaveLength(0)
  })

  it.each([{}, { name: '' }, { name: 'x'.repeat(65) }, { name: 'ha', scope: 'admin' }, { name: 'ha', expires_in_days: 0 }])(
    'rejects %j', async (payload) => {
      // Validation runs first: the ZodError becomes a 400 in the app's error handler (500 bare here)
      expect((await (await buildApp()).inject({ method: 'POST', url: '/', payload })).statusCode).not.toBe(201)
      expect(writes).toHaveLength(0)
      expect(mockTakeFirstOrThrow).not.toHaveBeenCalled()
    })
})

describe('GET / and DELETE /:id', () => {
  it('lists without any hash', async () => {
    mockExecute.mockResolvedValueOnce([{ id: ID, name: 'ha' }])
    const res = await (await buildApp()).inject({ method: 'GET', url: '/' })
    expect(res.json()).toEqual([{ id: ID, name: 'ha' }])
  })

  it('revokes only the caller\'s token', async () => {
    mockTakeFirst.mockResolvedValueOnce({ id: ID })
    const app = await buildApp()
    expect((await app.inject({ method: 'DELETE', url: `/${ID}` })).statusCode).toBe(204)
    expect(logAudit).toHaveBeenCalledWith('user-1', 'user.api_token_revoke', expect.objectContaining({ targetId: ID }))

    mockTakeFirst.mockResolvedValueOnce(undefined)
    expect((await app.inject({ method: 'DELETE', url: `/${ID}` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/not-a-uuid' })).statusCode).toBe(404)
  })
})

describe('hashApiToken', () => {
  it('is the hex SHA-256 used as lookup key', () => {
    expect(hashApiToken('nid_x')).toHaveLength(64)
    expect(hashApiToken('nid_x')).toBe(hashApiToken('nid_x'))
  })
})
