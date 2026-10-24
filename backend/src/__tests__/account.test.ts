import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const tables: string[] = []
const updates: any[] = []

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'set') return (values: any) => { updates.push(values); return chain }
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: (_t, op: string) => (table: string) => { tables.push(`${op}:${table}`); return chainable() } })
vi.mock('../db', () => ({ getDb: () => mockDb }))
vi.mock('../config', () => ({ config: { ARCHIVE_PATH: '/archives', FRONTEND_URL: 'http://localhost:3000' } }))

const deleteDir = vi.fn()
vi.mock('../storage/storage.service', () => ({ getLocalStorage: () => ({ deleteDir }) }))
vi.mock('bcrypt', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2b$12$new'), compare: vi.fn() },
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../plugins', () => ({ setAuthCookie: vi.fn(), clearAuthCookie: vi.fn() }))
vi.mock('../plugins/redis', () => ({ getRedis: vi.fn() }))
vi.mock('../auth/oauth.service', () => ({ getGmailAuthUrl: vi.fn(), exchangeGmailCode: vi.fn() }))
vi.mock('../auth/social.service', () => ({
  getEnabledProviders: vi.fn(), isProviderEnabled: vi.fn(), createAuthorizationUrl: vi.fn(), exchangeSocialCode: vi.fn(),
}))
vi.mock('../gmail/quota.service', () => ({ getInstanceQuotaStats: vi.fn() }))
vi.mock('../archive/trash.service', () => ({ emptyAllArchiveTrash: vi.fn(), getArchiveTrashSummary: vi.fn() }))
vi.mock('../archive/integrity.service', () => ({ getLastIntegrityCheck: vi.fn() }))

import bcrypt from 'bcrypt'
import { deleteUser, exportUserData } from '../account/account.service'
import { authRoutes } from '../routes/auth'
import { adminRoutes } from '../routes/admin'
import { setAuthCookie, clearAuthCookie } from '../plugins'

beforeEach(() => {
  vi.clearAllMocks()
  tables.length = 0
  updates.length = 0
})

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, { secret: 'test-secret-key-for-vitest-only' })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'me@test.com', role: 'admin' }
  })
  app.decorate('requireAdmin', async () => {})
  app.decorate('requireAccountOwnership', async () => {})
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.ready()
  return app
}

describe('deleteUser', () => {
  it('deletes the user row, then each Gmail account archive directory', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ email: 'u@test.com', role: 'user' })
    mockExecute.mockResolvedValueOnce([{ id: 'acc-1' }, { id: 'acc-2' }]).mockResolvedValueOnce([])

    expect(await deleteUser('user-2')).toEqual({ email: 'u@test.com' })
    expect(tables).toContain('deleteFrom:users')
    expect(deleteDir.mock.calls).toEqual([['/archives/acc-1'], ['/archives/acc-2']])
  })

  it('refuses to delete the last active admin', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ email: 'a@test.com', role: 'admin' })
      .mockResolvedValueOnce({ n: '0' })
    await expect(deleteUser('admin-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(tables).not.toContain('deleteFrom:users')
    expect(deleteDir).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown user', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    await expect(deleteUser('nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('exportUserData', () => {
  it('leaves mail bodies and file paths out of archived mails', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ id: 'user-1', email: 'me@test.com' })
    mockExecute.mockImplementation(async () => {
      const last = tables.at(-1)
      if (last === 'selectFrom:gmail_accounts') return [{ id: 'acc-1', email: 'me@gmail.com' }]
      if (last === 'selectFrom:archived_mails') return [{ id: 'm-1', subject: 'Hi', body_text: 'secret body', eml_path: '/x.eml' }]
      return []
    })
    const data = await exportUserData('user-1')
    expect(data.archivedMails).toEqual([{ id: 'm-1', subject: 'Hi' }])
    expect(data.gmailAccounts).toHaveLength(1)
    mockExecute.mockReset()
    mockExecuteTakeFirst.mockReset()
  })
})

describe('PATCH /auth/password', () => {
  it('checks the current password, stores the new hash and re-issues the cookie', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ password_hash: '$2b$12$old' })
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never)
    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH', url: '/auth/password', payload: { currentPassword: 'old-pass', newPassword: 'new-password' },
    })
    expect(res.statusCode).toBe(204)
    expect(updates[0]).toMatchObject({ password_hash: '$2b$12$new', password_changed_at: expect.any(Date) })
    expect(setAuthCookie).toHaveBeenCalled()
  })

  it('rejects a wrong current password', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ password_hash: '$2b$12$old' })
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never)
    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH', url: '/auth/password', payload: { currentPassword: 'bad', newPassword: 'new-password' },
    })
    expect(res.statusCode).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('returns 400 for an SSO-only account', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ password_hash: null })
    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH', url: '/auth/password', payload: { currentPassword: 'x', newPassword: 'new-password' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /auth/me', () => {
  it('requires the password of a local account', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ email: 'me@test.com', password_hash: '$2b$12$old' })
    const app = await buildApp()
    const res = await app.inject({ method: 'DELETE', url: '/auth/me', payload: { email: 'me@test.com' } })
    expect(res.statusCode).toBe(401)
    expect(tables).not.toContain('deleteFrom:users')
  })

  it('accepts the e-mail of an SSO-only account and clears the cookie', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ email: 'me@test.com', password_hash: null })
      .mockResolvedValueOnce({ email: 'me@test.com', role: 'user' })
    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const app = await buildApp()
    const res = await app.inject({ method: 'DELETE', url: '/auth/me', payload: { email: ' Me@Test.com ' } })
    expect(res.statusCode).toBe(204)
    expect(tables).toContain('deleteFrom:users')
    expect(clearAuthCookie).toHaveBeenCalled()
  })
})

describe('admin user management', () => {
  it('resets a password and revokes the sessions', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ email: 'u@test.com' })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/admin/users/user-2/password', payload: { password: 'temp-pass-1' } })
    expect(res.statusCode).toBe(204)
    expect(updates[0]).toMatchObject({ password_hash: '$2b$12$new', password_changed_at: expect.any(Date) })
  })

  it('rejects a password reset below 8 characters', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/admin/users/user-2/password', payload: { password: 'short' } })
    expect(res.statusCode).not.toBe(204)
    expect(updates).toHaveLength(0)
  })

  it('refuses to delete the admin themselves', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user-1' })
    expect(res.statusCode).toBe(400)
  })

  it('deletes another user', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ email: 'u@test.com', role: 'user' })
    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const app = await buildApp()
    const res = await app.inject({ method: 'DELETE', url: '/admin/users/user-2' })
    expect(res.statusCode).toBe(204)
    expect(tables).toContain('deleteFrom:users')
  })
})
