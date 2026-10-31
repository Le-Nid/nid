// The API token branch of app.authenticate: who gets in, where, and as whom
vi.mock('@fastify/cors', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/jwt', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/cookie', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/rate-limit', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/swagger', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/swagger-ui', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/multipart', () => ({ default: vi.fn(async () => {}) }))
vi.mock('../plugins/db', () => ({ connectDb: vi.fn(async () => {}) }))
vi.mock('../plugins/redis', () => ({ connectRedis: vi.fn(async () => {}), getRedis: vi.fn() }))
vi.mock('../db', () => ({ getDb: vi.fn() }))

const verifyApiToken = vi.hoisted(() => vi.fn())
vi.mock('../auth/api-tokens.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/api-tokens.service')>()),
  verifyApiToken,
}))

import { registerPlugins } from '../plugins/index'

const TOKEN = `nid_${'a'.repeat(43)}`

async function authenticate(method: string, route: string, authorization = `Bearer ${TOKEN}`) {
  const app: any = {
    register: vi.fn(), setErrorHandler: vi.fn(),
    decorate: vi.fn((name: string, fn: any) => { app[name] = fn }),
  }
  await registerPlugins(app)
  const request: any = { method, headers: { authorization }, routeOptions: { url: route }, jwtVerify: vi.fn().mockRejectedValue(new Error('not a JWT')) }
  const reply: any = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
  await app.authenticate(request, reply)
  return { request, reply }
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyApiToken.mockResolvedValue({ id: 't1', scope: 'write', userId: 'u1', email: 'ana@test.com' })
})

describe('authenticate with an API token', () => {
  it('signs the owner in, never as admin, without touching the JWT path', async () => {
    const { request, reply } = await authenticate('GET', '/api/dashboard/:accountId/stats')
    expect(reply.code).not.toHaveBeenCalled()
    expect(request.user).toEqual({ sub: 'u1', email: 'ana@test.com', role: 'user' })
    expect(request.jwtVerify).not.toHaveBeenCalled()
    expect(verifyApiToken).toHaveBeenCalledWith(TOKEN)
  })

  it('rejects unknown, expired or malformed tokens with 401', async () => {
    verifyApiToken.mockResolvedValueOnce(null)
    expect((await authenticate('GET', '/api/jobs')).reply.code).toHaveBeenCalledWith(401)

    const { reply } = await authenticate('GET', '/api/jobs', 'Bearer nid_too-short')
    expect(reply.code).toHaveBeenCalledWith(401)
    expect(verifyApiToken).toHaveBeenCalledTimes(1) // the malformed one never reaches the database
  })

  it.each(['/api/auth/api-tokens', '/api/auth/me', '/api/auth/2fa/setup', '/api/admin/users', '/api/privacy/:accountId/encrypt', '/api/webhooks', '/api/shares/:id'])(
    'keeps %s session-only', async (route) => {
      const { request, reply } = await authenticate('GET', route)
      expect(reply.code).toHaveBeenCalledWith(403)
      expect(request.user).toBeUndefined()
    })

  it('does not mistake a route that only starts like a denied prefix', async () => {
    expect((await authenticate('GET', '/api/authors')).reply.code).not.toHaveBeenCalled()
  })

  it('a read token can only read', async () => {
    verifyApiToken.mockResolvedValue({ id: 't1', scope: 'read', userId: 'u1', email: 'ana@test.com' })
    expect((await authenticate('GET', '/api/jobs')).reply.code).not.toHaveBeenCalled()
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await authenticate(method, '/api/jobs/:id/cancel')).reply.code).toHaveBeenCalledWith(403)
    }
  })

  it('leaves JWT bearers to the session path', async () => {
    const { request } = await authenticate('GET', '/api/jobs', 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y')
    expect(verifyApiToken).not.toHaveBeenCalled()
    expect(request.jwtVerify).toHaveBeenCalled()
  })
})
