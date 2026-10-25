import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()
const writes: { op: string; table: string; values?: any }[] = []
const chainable = (op: string, table: string): any => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockExecuteTakeFirstOrThrow
      if (prop === 'values' || prop === 'set') return (values: any) => { writes.push({ op, table, values }); return chain }
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: (_t, op: string) => (table: string) => chainable(op, table) })
vi.mock('../db', () => ({ getDb: () => mockDb }))
vi.mock('../config', () => ({ config: { FRONTEND_URL: 'https://nid.example.com' } }))

const webauthn = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))
vi.mock('@simplewebauthn/server', () => webauthn)

const redis = vi.hoisted(() => ({ set: vi.fn(), getdel: vi.fn() }))
vi.mock('../plugins/redis', () => ({ getRedis: () => redis }))
vi.mock('../plugins', () => ({ setAuthCookie: vi.fn() }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

import { passkeyRoutes } from '../routes/passkeys'
import { setAuthCookie } from '../plugins'
import { logAudit } from '../audit/audit.service'

const CHALLENGE_ID = 'c'.repeat(32)
const RESPONSE = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} }

beforeEach(() => {
  vi.clearAllMocks()
  writes.length = 0
})

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, { secret: 'test-secret-key-for-vitest-only' })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'ana@test.com', role: 'user' }
  })
  await app.register(passkeyRoutes)
  await app.ready()
  return app
}

describe('passkey registration', () => {
  it('asks for a discoverable, user-verified passkey on the frontend site, excluding the ones already there', async () => {
    mockExecute.mockResolvedValueOnce([{ credential_id: 'old', transports: ['internal'] }])
    webauthn.generateRegistrationOptions.mockResolvedValueOnce({ challenge: 'reg-challenge' })
    const res = await (await buildApp()).inject({ method: 'POST', url: '/register/options' })

    expect(res.statusCode).toBe(200)
    expect(webauthn.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'nid.example.com',
      userName: 'ana@test.com',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: [{ id: 'old', transports: ['internal'] }],
    }))
    expect(redis.set).toHaveBeenCalledWith('webauthn:reg:user-1', 'reg-challenge', 'EX', 300)
  })

  it('stores the verified passkey with its name', async () => {
    redis.getdel.mockResolvedValueOnce('reg-challenge')
    webauthn.verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['hybrid'] } },
    })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'pk-1', name: 'iPhone' })
    const res = await (await buildApp()).inject({ method: 'POST', url: '/register/verify', payload: { name: ' iPhone ', response: RESPONSE } })

    expect(res.statusCode).toBe(201)
    expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: 'reg-challenge', expectedOrigin: 'https://nid.example.com', expectedRPID: 'nid.example.com', requireUserVerification: true,
    }))
    expect(writes[0]).toMatchObject({ op: 'insertInto', table: 'passkeys', values: {
      user_id: 'user-1', credential_id: 'cred-1', public_key: Buffer.from([1, 2, 3]), counter: 0, transports: ['hybrid'], name: 'iPhone',
    } })
  })

  it('refuses an expired challenge or a response that does not verify', async () => {
    redis.getdel.mockResolvedValueOnce(null)
    const app = await buildApp()
    expect((await app.inject({ method: 'POST', url: '/register/verify', payload: { name: 'x', response: RESPONSE } })).statusCode).toBe(400)

    redis.getdel.mockResolvedValueOnce('reg-challenge')
    webauthn.verifyRegistrationResponse.mockRejectedValueOnce(new Error('bad signature'))
    expect((await app.inject({ method: 'POST', url: '/register/verify', payload: { name: 'x', response: RESPONSE } })).statusCode).toBe(400)
    expect(writes).toHaveLength(0)
  })
})

describe('passkey sign-in', () => {
  const STORED = { id: 'pk-1', public_key: Buffer.from([1, 2, 3]), counter: '4', transports: [], user_id: 'user-1', email: 'ana@test.com', role: 'user', is_active: true }

  it('hands out options with a single-use challenge id', async () => {
    webauthn.generateAuthenticationOptions.mockResolvedValueOnce({ challenge: 'auth-challenge' })
    const res = await (await buildApp()).inject({ method: 'POST', url: '/login/options' })
    const { challengeId } = res.json()
    expect(challengeId).toMatch(/^[0-9a-f]{32}$/)
    expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith({ rpID: 'nid.example.com', userVerification: 'required' })
    expect(redis.set).toHaveBeenCalledWith(`webauthn:auth:${challengeId}`, 'auth-challenge', 'EX', 300)
  })

  it('signs in with a verified passkey, updates its counter and skips the TOTP', async () => {
    redis.getdel.mockResolvedValueOnce('auth-challenge')
    mockExecuteTakeFirst.mockResolvedValueOnce(STORED)
    webauthn.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 5 } })
    const res = await (await buildApp()).inject({ method: 'POST', url: '/login/verify', payload: { challengeId: CHALLENGE_ID, response: RESPONSE } })

    expect(res.statusCode).toBe(200)
    expect(redis.getdel).toHaveBeenCalledWith(`webauthn:auth:${CHALLENGE_ID}`)
    expect(webauthn.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: 'auth-challenge', requireUserVerification: true,
      credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 4, transports: [] },
    }))
    expect(writes.find((w) => w.table === 'passkeys')?.values).toMatchObject({ counter: 5, last_used_at: expect.any(Date) })
    expect(setAuthCookie).toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalledWith('user-1', 'user.login_passkey', expect.anything())
  })

  it('gives the same 401 for an expired challenge, an unknown passkey, a disabled account or a bad signature', async () => {
    const app = await buildApp()
    const attempt = () => app.inject({ method: 'POST', url: '/login/verify', payload: { challengeId: CHALLENGE_ID, response: RESPONSE } })

    redis.getdel.mockResolvedValueOnce(null)
    expect((await attempt()).statusCode).toBe(401)

    redis.getdel.mockResolvedValueOnce('auth-challenge')
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    expect((await attempt()).statusCode).toBe(401)

    redis.getdel.mockResolvedValueOnce('auth-challenge')
    mockExecuteTakeFirst.mockResolvedValueOnce({ ...STORED, is_active: false })
    expect((await attempt()).statusCode).toBe(401)

    redis.getdel.mockResolvedValueOnce('auth-challenge')
    mockExecuteTakeFirst.mockResolvedValueOnce(STORED)
    webauthn.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false, authenticationInfo: {} })
    expect((await attempt()).statusCode).toBe(401)

    expect(setAuthCookie).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })
})

describe('passkey removal', () => {
  it('only removes a passkey of the signed-in user', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    const app = await buildApp()
    expect((await app.inject({ method: 'DELETE', url: '/123e4567-e89b-12d3-a456-426614174000' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/not-a-uuid' })).statusCode).toBe(404)

    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'pk-1' })
    expect((await app.inject({ method: 'DELETE', url: '/123e4567-e89b-12d3-a456-426614174000' })).statusCode).toBe(204)
    expect(logAudit).toHaveBeenCalledWith('user-1', 'user.passkey_remove', expect.anything())
  })
})
