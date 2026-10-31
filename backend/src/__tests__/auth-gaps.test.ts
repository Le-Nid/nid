import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([])
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockExecuteTakeFirstOrThrow
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockGetGmailAuthUrl = vi.fn().mockReturnValue('https://google.com/auth')
const mockExchangeGmailCode = vi.fn().mockResolvedValue({ id: 'acc-1', email: 'a@g.com' })
vi.mock('../auth/oauth.service', () => ({
  getGmailAuthUrl: (...args: any[]) => mockGetGmailAuthUrl(...args),
  exchangeGmailCode: (...args: any[]) => mockExchangeGmailCode(...args),
}))

const mockExchangeSocialCode = vi.fn()
const mockCreateAuthorizationUrl = vi.fn().mockReturnValue({ url: 'https://social.com/auth', codeVerifier: 'cv123' })
const mockIsProviderEnabled = vi.fn().mockReturnValue(true)
const mockGetEnabledProviders = vi.fn().mockReturnValue(['google'])
vi.mock('../auth/social.service', () => ({
  getEnabledProviders: () => mockGetEnabledProviders(),
  isProviderEnabled: (...args: any[]) => mockIsProviderEnabled(...args),
  createAuthorizationUrl: (...args: any[]) => mockCreateAuthorizationUrl(...args),
  exchangeSocialCode: (...args: any[]) => mockExchangeSocialCode(...args),
}))

vi.mock('../config', () => ({
  config: {
    ALLOW_REGISTRATION: true,
    ADMIN_EMAIL: undefined,
    GOOGLE_SSO_REDIRECT_URI: 'http://localhost/google/callback',
    FRONTEND_URL: 'http://localhost:3000',
  },
}))

vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../plugins', () => ({
  setAuthCookie: vi.fn(),
  clearAuthCookie: vi.fn(),
}))

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn(),
}
vi.mock('../plugins/redis', () => ({ getRedis: () => mockRedis }))

const mockVerifySync = vi.fn().mockReturnValue({ valid: true })
vi.mock('otplib', () => ({ verifySync: (...args: any[]) => mockVerifySync(...args) }))

import { authRoutes } from '../routes/auth'
import { setAuthCookie } from '../plugins'

async function buildAuthApp() {
  const app = Fastify({ logger: false })
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, { secret: 'test-secret-key-for-jwt-signing' })

  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }
  })

  await app.register(authRoutes)
  await app.ready()
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('authRoutes - coverage gaps', () => {
  // ─── GET /google ──────────────────────────────────────────
  it('GET /google returns SSO URL', async () => {
    const app = await buildAuthApp()
    const res = await app.inject({ method: 'GET', url: '/google' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.url).toBe('https://social.com/auth')
    expect(mockCreateAuthorizationUrl).toHaveBeenCalledWith('google', expect.any(String))
    await app.close()
  })

  // ─── GET /google/callback - success ─────────────────────
  it('GET /google/callback redirects on success', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv123' }))
    mockExchangeSocialCode.mockResolvedValueOnce({
      id: 'user-1', email: 'test@test.com', role: 'user',
    })
    const res = await app.inject({
      method: 'GET',
      url: '/google/callback?code=abc&state=xyz',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('sso_code=')
    await app.close()
  })

  // ─── GET /google/callback - error ─────────────────────
  it('GET /google/callback redirects to error when exchangeSocialCode fails', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv123' }))
    mockExchangeSocialCode.mockRejectedValueOnce(new Error('Invalid code'))
    const res = await app.inject({
      method: 'GET',
      url: '/google/callback?code=bad&state=xyz',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('google=error')
    await app.close()
  })

  // ─── GET /google/callback - disabled account ─────────────
  it('GET /google/callback redirects to disabled when account disabled', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv123' }))
    mockExchangeSocialCode.mockRejectedValueOnce(new Error('Account is disabled'))
    const res = await app.inject({
      method: 'GET',
      url: '/google/callback?code=bad&state=xyz',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('google=disabled')
    await app.close()
  })

  // ─── GET /google/callback - no state ─────────────────────
  it('GET /google/callback redirects to error when state not found', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'GET',
      url: '/google/callback?code=abc&state=expired',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('google=error')
    await app.close()
  })

  // ─── POST /google/exchange ────────────────────────────────
  it('POST /google/exchange returns user info from redis code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ id: 'u1', email: 'e@e.com', role: 'user' }))
    const res = await app.inject({
      method: 'POST',
      url: '/google/exchange',
      payload: { code: 'auth-code-123' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe('e@e.com')
    await app.close()
  })

  it('POST /google/exchange returns 401 for invalid code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'POST',
      url: '/google/exchange',
      payload: { code: 'bad-code' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  // ─── GET /gmail/callback - success ──────────────────────
  it('GET /gmail/callback success redirects to settings', async () => {
    const app = await buildAuthApp()
    // The route does app.jwt.verify(state), so we need a valid JWT as state
    const state = app.jwt.sign({ userId: 'user-1', purpose: 'gmail_oauth' }, { expiresIn: '5m' })
    const res = await app.inject({
      method: 'GET',
      url: `/gmail/callback?code=auth_code&state=${encodeURIComponent(state)}`,
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('gmail=connected')
    await app.close()
  })

  it('GET /gmail/callback flags a newly added account (setup wizard), not a reconnection', async () => {
    const app = await buildAuthApp()
    const state = app.jwt.sign({ userId: 'user-1', purpose: 'gmail_oauth' }, { expiresIn: '5m' })
    const url = `/gmail/callback?code=auth_code&state=${encodeURIComponent(state)}`
    mockExchangeGmailCode.mockResolvedValueOnce({ id: 'acc-1', email: 'new@gmail.com', inserted: true })
    expect((await app.inject({ method: 'GET', url })).headers.location).toMatch(/account=new%40gmail\.com&new=1$/)
    mockExchangeGmailCode.mockResolvedValueOnce({ id: 'acc-1', email: 'new@gmail.com', inserted: false })
    expect((await app.inject({ method: 'GET', url })).headers.location).not.toContain('new=1')
    await app.close()
  })

  // ─── GET /gmail/callback - error ──────────────────────
  it('GET /gmail/callback error redirects to settings error', async () => {
    const app = await buildAuthApp()
    // Bad state → jwt.verify will throw
    const res = await app.inject({
      method: 'GET',
      url: '/gmail/callback?code=auth_code&state=invalid_jwt',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('gmail=error')
    await app.close()
  })

  // ─── GET /social/:provider/callback - success ────────────
  it('GET /social/:provider/callback success redirects with sso_code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv' }))
    mockExchangeSocialCode.mockResolvedValueOnce({
      id: 'u1', email: 'e@e.com', role: 'user',
    })
    const res = await app.inject({
      method: 'GET',
      url: '/social/google/callback?code=abc&state=s1',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('sso_code=')
    await app.close()
  })

  // ─── GET /social/:provider/callback - provider mismatch ──
  it('GET /social/:provider/callback redirects error when provider mismatch', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'discord', codeVerifier: 'cv' }))
    const res = await app.inject({
      method: 'GET',
      url: '/social/google/callback?code=abc&state=s1',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('social=error')
    await app.close()
  })

  // ─── GET /social/:provider/callback - disabled account ───
  it('GET /social/:provider/callback redirects disabled on disabled account', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv' }))
    mockExchangeSocialCode.mockRejectedValueOnce(new Error('Account is disabled'))
    const res = await app.inject({
      method: 'GET',
      url: '/social/google/callback?code=abc&state=s1',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('social=disabled')
    await app.close()
  })

  // ─── GET /social/:provider/callback - disabled provider ──
  it('GET /social/:provider/callback redirects error when provider not enabled', async () => {
    const app = await buildAuthApp()
    mockIsProviderEnabled.mockReturnValueOnce(false)
    const res = await app.inject({
      method: 'GET',
      url: '/social/discord/callback?code=abc&state=s1',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('social=error')
    await app.close()
  })

  // ─── GET /social/:provider/callback - no state ────────────
  it('GET /social/:provider/callback redirects error when state missing', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'GET',
      url: '/social/google/callback?code=abc&state=bad',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('social=error')
    await app.close()
  })

  // ─── POST /logout ────────────────────────────────────────
  it('POST /logout blacklists JWT and clears cookie', async () => {
    const app = await buildAuthApp()
    const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/logout',
      cookies: { token },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
    await app.close()
  })

  // ─── POST /refresh ───────────────────────────────────────
  it('POST /refresh returns new token', async () => {
    const app = await buildAuthApp()
    const res = await app.inject({ method: 'POST', url: '/refresh' })
    expect(res.statusCode).toBe(200)
    expect(res.json().user).toBeDefined()
    await app.close()
  })

  // ─── GET /gmail/connect - quota exceeded ──────────────────
  it('GET /gmail/connect returns 403 when quota exceeded', async () => {
    const app = await buildAuthApp()
    mockExecuteTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 2 })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 2 })
    const res = await app.inject({ method: 'GET', url: '/gmail/connect' })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  // ─── DELETE /gmail/:accountId ─────────────────────────────
  it('DELETE /gmail/:accountId removes account', async () => {
    const app = await buildAuthApp()
    const res = await app.inject({ method: 'DELETE', url: '/gmail/acc-1' })
    expect(res.statusCode).toBe(204)
    await app.close()
  })
})

describe('SSO login with 2FA enabled', () => {
  const pendingTotp = JSON.stringify({
    id: 'u1', email: 'e@e.com', role: 'user', totpRequired: true, auditAction: 'user.login_sso',
  })

  it('callback sets no session cookie and keeps a pending code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv' }))
    mockExchangeSocialCode.mockResolvedValueOnce({ id: 'u1', email: 'e@e.com', role: 'user' })
    mockExecuteTakeFirst.mockResolvedValueOnce({ totp_enabled: true, totp_secret: 'SECRET' })
    const res = await app.inject({ method: 'GET', url: '/google/callback?code=abc&state=xyz' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('sso_code=')
    expect(setAuthCookie).not.toHaveBeenCalled()
    const [, stored, , ttl] = mockRedis.set.mock.calls.at(-1)!
    expect(JSON.parse(stored).totpRequired).toBe(true)
    expect(ttl).toBe(300)
    await app.close()
  })

  it('social callback also defers the session cookie', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv' }))
    mockExchangeSocialCode.mockResolvedValueOnce({ id: 'u1', email: 'e@e.com', role: 'user' })
    mockExecuteTakeFirst.mockResolvedValueOnce({ totp_enabled: true, totp_secret: 'SECRET' })
    const res = await app.inject({ method: 'GET', url: '/social/google/callback?code=abc&state=s1' })
    expect(res.statusCode).toBe(302)
    expect(setAuthCookie).not.toHaveBeenCalled()
    await app.close()
  })

  it('exchange asks for the TOTP code and keeps the pending code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(pendingTotp)
    const res = await app.inject({ method: 'POST', url: '/google/exchange', payload: { code: 'c1' } })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('TOTP_REQUIRED')
    expect(mockRedis.del).not.toHaveBeenCalled()
    expect(setAuthCookie).not.toHaveBeenCalled()
    await app.close()
  })

  it('exchange opens the session with a valid TOTP code', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(pendingTotp)
    mockExecuteTakeFirst.mockResolvedValueOnce({ totp_secret: 'SECRET', is_active: true })
    const res = await app.inject({ method: 'POST', url: '/google/exchange', payload: { code: 'c1', totpCode: '123456' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'u1', email: 'e@e.com', role: 'user' })
    expect(mockVerifySync).toHaveBeenCalledWith({ token: '123456', secret: 'SECRET' })
    expect(setAuthCookie).toHaveBeenCalledTimes(1)
    expect(mockRedis.del).toHaveBeenCalledWith('sso:code:c1')
    await app.close()
  })

  it('exchange rejects an invalid TOTP code without opening a session', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(pendingTotp)
    mockExecuteTakeFirst.mockResolvedValueOnce({ totp_secret: 'SECRET', is_active: true })
    mockVerifySync.mockReturnValueOnce({ valid: false })
    const res = await app.inject({ method: 'POST', url: '/google/exchange', payload: { code: 'c1', totpCode: '000000' } })
    expect(res.statusCode).toBe(401)
    expect(setAuthCookie).not.toHaveBeenCalled()
    expect(mockRedis.del).not.toHaveBeenCalled()
    await app.close()
  })

  it('exchange drops the pending code after too many invalid TOTP codes', async () => {
    const app = await buildAuthApp()
    mockRedis.get.mockResolvedValueOnce(pendingTotp)
    mockRedis.incr.mockResolvedValueOnce(5)
    mockExecuteTakeFirst.mockResolvedValueOnce({ totp_secret: 'SECRET', is_active: true })
    mockVerifySync.mockReturnValueOnce({ valid: false })
    const res = await app.inject({ method: 'POST', url: '/google/exchange', payload: { code: 'c1', totpCode: '000000' } })
    expect(res.statusCode).toBe(401)
    expect(mockRedis.del).toHaveBeenCalledWith('sso:code:c1')
    await app.close()
  })
})
