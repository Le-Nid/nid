import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import crypto from 'node:crypto'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecuteTakeFirst = vi.fn()
const updates: any[] = []
const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'execute') return vi.fn().mockResolvedValue([])
      if (prop === 'set') return (values: any) => { updates.push(values); return chain }
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))
vi.mock('../config', () => ({ config: { FRONTEND_URL: 'https://nid.test' } }))

const mail = vi.hoisted(() => ({ enabled: true, send: vi.fn() }))
vi.mock('../mail/mail.service', () => ({ isMailEnabled: () => mail.enabled, sendMail: mail.send }))

const redis = vi.hoisted(() => ({ set: vi.fn(), getdel: vi.fn(), get: vi.fn(), del: vi.fn() }))
vi.mock('../plugins/redis', () => ({ getRedis: () => redis }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('$2b$12$new'), compare: vi.fn() } }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../plugins', () => ({ setAuthCookie: vi.fn(), clearAuthCookie: vi.fn() }))
vi.mock('../account/account.service', () => ({ deleteUser: vi.fn(), exportUserData: vi.fn() }))
vi.mock('../auth/oauth.service', () => ({ getGmailAuthUrl: vi.fn(), exchangeGmailCode: vi.fn() }))
vi.mock('../auth/social.service', () => ({
  getEnabledProviders: vi.fn().mockReturnValue([]), isProviderEnabled: vi.fn(), createAuthorizationUrl: vi.fn(), exchangeSocialCode: vi.fn(),
}))

import { authRoutes } from '../routes/auth'
import { setAuthCookie } from '../plugins'

const TOKEN = 'a'.repeat(64)
const KEY = `pwreset:${crypto.createHash('sha256').update(TOKEN).digest('hex')}`

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  mail.enabled = true
  mail.send.mockResolvedValue(undefined)
  redis.set.mockResolvedValue('OK')
})

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, { secret: 'test-secret-key-for-vitest-only' })
  app.decorate('authenticate', async () => {})
  await app.register(authRoutes)
  await app.ready()
  return app
}
const forgot = async (email: string) => (await buildApp()).inject({ method: 'POST', url: '/password/forgot', payload: { email } })
const reset = async (token = TOKEN) =>
  (await buildApp()).inject({ method: 'POST', url: '/password/reset', payload: { token, newPassword: 'new-password' } })

describe('POST /password/forgot', () => {
  it('e-mails a link whose token is stored hashed, for one hour', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'u1', email: 'ana@test.com', password_hash: 'h', is_active: true })
    expect((await forgot('ana@test.com')).statusCode).toBe(204)

    const [to, , text] = mail.send.mock.calls[0]
    const token = /reset-password\?token=([0-9a-f]{64})/.exec(text)![1]
    expect(to).toBe('ana@test.com')
    expect(text).toContain('https://nid.test/reset-password?token=')
    const stored = redis.set.mock.calls.find((c) => String(c[0]).startsWith('pwreset:') && !String(c[0]).includes('cooldown'))!
    expect(stored[0]).toBe(`pwreset:${crypto.createHash('sha256').update(token).digest('hex')}`)
    expect(stored[0]).not.toContain(token)
    expect(stored.slice(2)).toEqual(['EX', 3600])
  })

  it('answers the same for an unknown, SSO-only or disabled address, without e-mail', async () => {
    for (const user of [undefined, { id: 'u2', email: 'x', password_hash: null, is_active: true }, { id: 'u3', email: 'y', password_hash: 'h', is_active: false }]) {
      mockExecuteTakeFirst.mockResolvedValueOnce(user)
      expect((await forgot('who@test.com')).statusCode).toBe(204)
    }
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('sends at most one e-mail per account per minute', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'u1', email: 'ana@test.com', password_hash: 'h', is_active: true })
    redis.set.mockResolvedValueOnce(null) // NX refused: cooldown running
    expect((await forgot('ana@test.com')).statusCode).toBe(204)
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('does not exist without SMTP', async () => {
    mail.enabled = false
    expect((await forgot('ana@test.com')).statusCode).toBe(404)
  })
})

describe('POST /password/reset', () => {
  it('consumes the token once and sets the new password, revoking the sessions, without signing in', async () => {
    redis.getdel.mockResolvedValueOnce(JSON.stringify({ userId: 'u1', issuedAt: Date.now() }))
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'u1', is_active: true, password_changed_at: null })
    expect((await reset()).statusCode).toBe(204)
    expect(redis.getdel).toHaveBeenCalledWith(KEY)
    expect(updates[0]).toMatchObject({ password_hash: '$2b$12$new', password_changed_at: expect.any(Date) })
    expect(setAuthCookie).not.toHaveBeenCalled()
  })

  it('rejects an unknown or already used token', async () => {
    redis.getdel.mockResolvedValueOnce(null)
    expect((await reset()).statusCode).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('rejects a link issued before the last password change', async () => {
    const issuedAt = Date.now() - 60_000
    redis.getdel.mockResolvedValueOnce(JSON.stringify({ userId: 'u1', issuedAt }))
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'u1', is_active: true, password_changed_at: new Date(issuedAt + 1000) })
    expect((await reset()).statusCode).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('rejects a malformed token before touching Redis', async () => {
    const res = await reset('../../etc')
    expect(res.statusCode).not.toBe(204)
    expect(redis.getdel).not.toHaveBeenCalled()
  })
})
