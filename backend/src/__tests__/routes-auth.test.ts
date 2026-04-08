import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
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

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('otplib', () => ({
  verifySync: vi.fn().mockReturnValue({ valid: true }),
}))

vi.mock('../auth/oauth.service', () => ({
  getGmailAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/oauth'),
  exchangeGmailCode: vi.fn().mockResolvedValue({ id: 'acc-1', email: 'test@gmail.com' }),
}))
vi.mock('../auth/social.service', () => ({
  getEnabledProviders: vi.fn().mockReturnValue(['google']),
  isProviderEnabled: vi.fn().mockReturnValue(true),
  createAuthorizationUrl: vi.fn().mockReturnValue({ url: 'https://auth.example.com', codeVerifier: 'cv' }),
  exchangeSocialCode: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'user' }),
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../plugins', () => ({
  setAuthCookie: vi.fn(),
  clearAuthCookie: vi.fn(),
}))

const mockRedisGet = vi.fn().mockResolvedValue(null)
const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()
vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  }),
}))

import { authRoutes } from '../routes/auth'
import bcrypt from 'bcrypt'

beforeEach(() => vi.clearAllMocks())

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, { secret: 'test-secret-key-for-vitest-only' })

  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  app.decorate('redis', { get: mockRedisGet, set: mockRedisSet, del: mockRedisDel } as any)

  await app.register(authRoutes)
  await app.ready()
  return app
}

describe('authRoutes', () => {
  describe('GET /config', () => {
    it('returns public config', async () => {
      const app = await buildApp()
      const res = await app.inject({ method: 'GET', url: '/config' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.socialProviders).toBeDefined()
      await app.close()
    })
  })

  describe('POST /register', () => {
    it('registers a new user', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce(null) // no existing user
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'user-new', email: 'new@test.com', role: 'user' })

      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'new@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(201)
      await app.close()
    })

    it('returns 409 for existing email', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'existing' })

      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'exists@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(409)
      await app.close()
    })
  })

  describe('POST /login', () => {
    it('logs in a user', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: '$2b$12$hashed',
        role: 'user',
        is_active: true,
        totp_enabled: false,
      })
      mockExecute.mockResolvedValue([])

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(200)
      await app.close()
    })

    it('returns 401 for invalid credentials', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'bad@test.com', password: 'wrongpassword123' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })

    it('returns 401 for wrong password', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: '$2b$12$hashed',
        role: 'user',
        is_active: true,
        totp_enabled: false,
      })
      ;(bcrypt.compare as any).mockResolvedValueOnce(false)

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@test.com', password: 'wrongpassword1' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })

    it('returns 403 when TOTP required but not provided', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: '$2b$12$hashed',
        role: 'user',
        is_active: true,
        totp_enabled: true,
        totp_secret: 'TOTP_SECRET',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(403)
      await app.close()
    })

    it('returns 401 for inactive user', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@test.com',
        password_hash: '$2b$12$hashed',
        role: 'user',
        is_active: false,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })
  })

  describe('POST /logout', () => {
    it('logs out and blacklists JWT', async () => {
      const app = await buildApp()

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'POST',
        url: '/logout',
        headers: { authorization: `Bearer ${token}` },
        cookies: { token },
      })
      expect(res.statusCode).toBe(204)
      await app.close()
    })
  })

  describe('POST /refresh', () => {
    it('refreshes the token', async () => {
      const app = await buildApp()

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      await app.close()
    })
  })

  describe('GET /me', () => {
    it('returns current user profile', async () => {
      const app = await buildApp()

      mockExecuteTakeFirst
        .mockResolvedValueOnce({ id: 'user-1', email: 'test@test.com', role: 'user' }) // user
        .mockResolvedValueOnce({ total: '0' }) // storage
      mockExecute.mockResolvedValueOnce([]) // accounts

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      await app.close()
    })
  })

  describe('GET /gmail/connect', () => {
    it('returns Gmail OAuth URL', async () => {
      const app = await buildApp()

      mockExecuteTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 3 })
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'GET',
        url: '/gmail/connect',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().url).toBeDefined()
      await app.close()
    })
  })

  describe('GET /gmail/callback', () => {
    it('handles Gmail OAuth callback', async () => {
      const app = await buildApp()

      const state = app.jwt.sign({ userId: 'user-1', purpose: 'gmail_oauth' }, { expiresIn: '5m' })
      const res = await app.inject({
        method: 'GET',
        url: `/gmail/callback?code=auth_code&state=${encodeURIComponent(state)}`,
      })
      // Redirects to frontend
      expect(res.statusCode).toBe(302)
      await app.close()
    })
  })

  describe('DELETE /gmail/:accountId', () => {
    it('deletes a Gmail account', async () => {
      const app = await buildApp()
      mockExecute.mockResolvedValue([])

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'DELETE',
        url: '/gmail/acc-1',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(204)
      await app.close()
    })
  })

  describe('GET /social/:provider/url', () => {
    it('returns social auth URL', async () => {
      const app = await buildApp()

      const res = await app.inject({ method: 'GET', url: '/social/google/url' })
      expect(res.statusCode).toBe(200)
      expect(res.json().url).toBeDefined()
      await app.close()
    })
  })

  describe('GET /social/:provider/callback', () => {
    it('handles social OAuth callback', async () => {
      const app = await buildApp()
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({ provider: 'google', codeVerifier: 'cv' }))

      const res = await app.inject({
        method: 'GET',
        url: '/social/google/callback?code=auth_code&state=test-state',
      })
      expect(res.statusCode).toBe(302)
      await app.close()
    })

    it('redirects with error when state not found', async () => {
      const app = await buildApp()
      mockRedisGet.mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'GET',
        url: '/social/google/callback?code=auth_code&state=bad-state',
      })
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toContain('social=error')
      await app.close()
    })
  })

  describe('POST /google/exchange', () => {
    it('exchanges SSO code for user info', async () => {
      const app = await buildApp()
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({ id: 'user-1', email: 'test@test.com', role: 'user' }))

      const res = await app.inject({
        method: 'POST',
        url: '/google/exchange',
        payload: { code: 'sso-code' },
      })
      expect(res.statusCode).toBe(200)
      await app.close()
    })

    it('returns 401 for invalid code', async () => {
      const app = await buildApp()
      mockRedisGet.mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'POST',
        url: '/google/exchange',
        payload: { code: 'bad-code' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })
  })

  describe('POST /login - additional branches', () => {
    it('returns 401 for user without password_hash (SSO-only)', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-sso',
        email: 'sso@test.com',
        password_hash: null,
        role: 'user',
        is_active: true,
        totp_enabled: false,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'sso@test.com', password: 'anypassword1' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })

    it('returns 401 for invalid TOTP code', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-totp',
        email: 'totp@test.com',
        password_hash: '$2b$12$hash',
        role: 'user',
        is_active: true,
        totp_enabled: true,
        totp_secret: 'SECRET',
      })
      const otplib = await import('otplib')
      ;(otplib.verifySync as any).mockReturnValueOnce({ valid: false })

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'totp@test.com', password: 'password123', totpCode: '000000' },
      })
      expect(res.statusCode).toBe(401)
      await app.close()
    })
  })

  describe('POST /register - additional branches', () => {
    it('returns 403 when registration is disabled', async () => {
      const { config } = await import('../config')
      const originalAllow = config.ALLOW_REGISTRATION
      ;(config as any).ALLOW_REGISTRATION = false

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'new@test.com', password: 'password123' },
      })
      expect(res.statusCode).toBe(403)
      ;(config as any).ALLOW_REGISTRATION = originalAllow
      await app.close()
    })
  })

  describe('GET /me - storage coalesce branch', () => {
    it('handles null storage total', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst
        .mockResolvedValueOnce({ id: 'user-1', email: 'test@test.com', role: 'user', is_active: true })  // user
        .mockResolvedValueOnce({ total: null }) // storageUsed null
      mockExecute.mockResolvedValueOnce([]) // accounts

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.storageUsedBytes).toBe(0)
      await app.close()
    })
  })

  describe('GET /gmail/connect - quota branches', () => {
    it('returns 403 when gmail account quota exceeded', async () => {
      const app = await buildApp()
      mockExecuteTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 1 }) // user max
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 }) // current count

      const token = app.jwt.sign({ sub: 'user-1', email: 'test@test.com', role: 'user' })
      const res = await app.inject({
        method: 'GET',
        url: '/gmail/connect',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
      await app.close()
    })
  })
})
