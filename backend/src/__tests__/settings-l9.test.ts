import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'

// L9b « Paramètres »: automatic backups (B12), reader preference (B10), « Action requise » (expired Google grant)

// Recording Kysely stand-in: every call is logged, the terminal methods are mocks
const calls: { method: string; args: unknown[] }[] = []
const mockExecute = vi.fn()
const mockTakeFirst = vi.fn()
const chain: any = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return undefined
    if (prop === 'execute') return mockExecute
    if (prop === 'executeTakeFirst') return mockTakeFirst
    if (prop === 'executeTakeFirstOrThrow') return mockTakeFirst
    return (...args: unknown[]) => {
      calls.push({ method: prop, args })
      return chain
    }
  },
})
vi.mock('../db', () => ({ getDb: () => chain }))

const mockEnqueue = vi.fn().mockResolvedValue({ id: 'job-1' })
vi.mock('../jobs/queue', () => ({ enqueueJob: (...args: unknown[]) => mockEnqueue(...args) }))
vi.mock('../analytics/analytics.service', () => ({ recordInboxSnapshot: vi.fn() }))
vi.mock('../expiration/expiration.service', () => ({ processExpiredEmails: vi.fn() }))
vi.mock('../archive/sharing.service', () => ({ cleanupExpiredShares: vi.fn() }))
vi.mock('../labels/labels.service', () => ({ syncAllLabels: vi.fn(), syncLabels: vi.fn() }))
vi.mock('../archive/body-text', () => ({ countPendingBodyText: vi.fn() }))
vi.mock('../auth/social.service', () => ({ getEnabledProviders: vi.fn(() => []), isProviderEnabled: vi.fn(), createAuthorizationUrl: vi.fn(), exchangeSocialCode: vi.fn() }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
const mockNotify = vi.hoisted(() => vi.fn())
vi.mock('../notifications/notify', () => ({ notify: mockNotify }))
vi.mock('../plugins', () => ({ setAuthCookie: vi.fn(), clearAuthCookie: vi.fn() }))
vi.mock('../plugins/redis', () => ({ getRedis: vi.fn(() => ({})) }))

const mockGetAccessToken = vi.fn()
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn()
        on = vi.fn()
        getAccessToken = mockGetAccessToken
        getToken = vi.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: 1 } })
      },
    },
    oauth2: () => ({ userinfo: { get: vi.fn().mockResolvedValue({ data: { email: 'a@gmail.com' } }) } }),
  },
}))

import { enqueueDueBackups, startRuleScheduler } from '../jobs/scheduler'
import { authRoutes } from '../routes/auth'
import { notificationsRoutes } from '../routes/notifications'
import { exchangeGmailCode, getAuthenticatedClient, isInvalidGrant } from '../auth/oauth.service'

const ACCOUNT = '3f1c2a7e-8a4b-4c1d-9e2f-0123456789ab'
const now = new Date('2026-10-21T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
})

describe('enqueueDueBackups (B12)', () => {
  it('only reads active accounts with backups on and no pending reconnection', async () => {
    mockExecute.mockResolvedValueOnce([])
    await enqueueDueBackups(now)
    const wheres = calls.filter((c) => c.method === 'where').map((c) => c.args)
    expect(wheres).toEqual(expect.arrayContaining([
      ['is_active', '=', true], ['backup_enabled', '=', true], ['auth_error_at', 'is', null],
    ]))
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('backs up accounts never backed up or past their interval, then stamps last_backup_at', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'a', user_id: 'u', backup_interval: '1h', last_backup_at: null },
      { id: 'b', user_id: 'u', backup_interval: '6h', last_backup_at: hoursAgo(7) },
      { id: 'c', user_id: 'u', backup_interval: '6h', last_backup_at: hoursAgo(2) },
      { id: 'd', user_id: 'u', backup_interval: '24h', last_backup_at: hoursAgo(23) },
    ])
    await enqueueDueBackups(now)
    expect(mockEnqueue.mock.calls).toEqual([
      ['archive_mails', { accountId: 'a', userId: 'u', differential: true }, { dedupId: 'backup-a' }],
      ['archive_mails', { accountId: 'b', userId: 'u', differential: true }, { dedupId: 'backup-b' }],
    ])
    expect(calls.filter((c) => c.method === 'set').map((c) => c.args[0])).toEqual([{ last_backup_at: now }, { last_backup_at: now }])
  })
})

async function buildApp(register: (app: any) => Promise<void>) {
  const app = Fastify({ logger: false })
  await app.register(cookie)
  await app.register(jwt, { secret: 'test-secret-key-for-vitest-only' })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', role: 'user' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  await app.register(register)
  await app.ready()
  return app
}

describe('PATCH /gmail/:accountId (B12)', () => {
  const patch = async (url: string, payload: unknown) => {
    const app = await buildApp(authRoutes)
    const res = await app.inject({ method: 'PATCH', url, payload: payload as any })
    await app.close()
    return res
  }

  it('updates the backup settings of an account of the user', async () => {
    mockTakeFirst.mockResolvedValueOnce({ id: ACCOUNT, backup_enabled: true, backup_interval: '6h' })
    const res = await patch(`/gmail/${ACCOUNT}`, { backup_enabled: true, backup_interval: '6h' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: ACCOUNT, backup_enabled: true, backup_interval: '6h' })
    expect(calls.find((c) => c.method === 'set')?.args[0]).toMatchObject({ backup_enabled: true, backup_interval: '6h' })
    expect(calls.filter((c) => c.method === 'where').map((c) => c.args)).toContainEqual(['user_id', '=', 'user-1'])
  })

  it('rejects an unknown interval, an unknown field and an empty body', async () => {
    expect((await patch(`/gmail/${ACCOUNT}`, { backup_interval: '2h' })).statusCode).toBe(400)
    expect((await patch(`/gmail/${ACCOUNT}`, { is_active: false })).statusCode).toBe(400)
    expect((await patch(`/gmail/${ACCOUNT}`, {})).statusCode).toBe(400)
    expect(mockTakeFirst).not.toHaveBeenCalled()
  })

  it('answers 404 for a malformed id or an account of someone else', async () => {
    expect((await patch('/gmail/not-a-uuid', { backup_enabled: true })).statusCode).toBe(404)
    mockTakeFirst.mockResolvedValueOnce(undefined)
    expect((await patch(`/gmail/${ACCOUNT}`, { backup_enabled: true })).statusCode).toBe(404)
  })
})

describe('GET /me — account state for Paramètres > Comptes Gmail', () => {
  it('returns the accounts with their backup settings and reconnection flag', async () => {
    const account = { id: ACCOUNT, email: 'a@gmail.com', backup_enabled: true, backup_interval: '1h', needs_reauth: true, last_sync_at: null }
    mockTakeFirst.mockResolvedValueOnce({ id: 'user-1' }).mockResolvedValueOnce({ total: '0' })
    mockExecute.mockResolvedValueOnce([account])
    const app = await buildApp(authRoutes)
    const res = await app.inject({ method: 'GET', url: '/me' })
    await app.close()
    expect(res.json().gmailAccounts).toEqual([account])
  })
})

describe('notification preferences — remote images (B10)', () => {
  it('blocks remote images by default', async () => {
    mockTakeFirst.mockResolvedValueOnce(undefined)
    const app = await buildApp(notificationsRoutes)
    const res = await app.inject({ method: 'GET', url: '/preferences' })
    await app.close()
    expect(res.json().remote_images).toBe('block')
  })

  it('stores allow/block and ignores any other value', async () => {
    const app = await buildApp(notificationsRoutes)
    mockTakeFirst.mockResolvedValue({ id: 'p1' })
    await app.inject({ method: 'PUT', url: '/preferences', payload: { remote_images: 'allow' } })
    await app.inject({ method: 'PUT', url: '/preferences', payload: { remote_images: 'sometimes' } })
    await app.close()
    const sets = calls.filter((c) => c.method === 'set').map((c) => c.args[0] as Record<string, unknown>)
    expect(sets[0].remote_images).toBe('allow')
    expect(sets[1]).not.toHaveProperty('remote_images')
  })
})

describe('« Action requise » — expired Google grant', () => {
  it('recognises invalid_grant in either shape', () => {
    expect(isInvalidGrant({ response: { data: { error: 'invalid_grant' } } })).toBe(true)
    expect(isInvalidGrant(new Error('invalid_grant: Token has been expired or revoked.'))).toBe(true)
    expect(isInvalidGrant(new Error('socket hang up'))).toBe(false)
    expect(isInvalidGrant(null)).toBe(false)
  })

  it('records the error on the account when the refresh is refused, and rethrows', async () => {
    mockTakeFirst.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_expiry: hoursAgo(1) })
    mockGetAccessToken.mockRejectedValueOnce(Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } }))
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toThrow('invalid_grant')
    expect(calls.find((c) => c.method === 'set')?.args[0]).toEqual({ auth_error_at: expect.any(Date) })
  })

  it('flags the account when no refresh token is stored (SSO login used to wipe it)', async () => {
    mockTakeFirst.mockResolvedValueOnce({ access_token: 'a', refresh_token: '', token_expiry: hoursAgo(1) })
    mockGetAccessToken.mockRejectedValueOnce(new Error('No refresh token or refresh handler callback is set.'))
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toThrow('No refresh token')
    expect(calls.find((c) => c.method === 'set')?.args[0]).toEqual({ auth_error_at: expect.any(Date) })
  })

  it('notifies once (bell + account.reauth_required webhook), not again while the account stays flagged', async () => {
    const refused = () => mockGetAccessToken.mockRejectedValueOnce(Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } }))
    mockTakeFirst
      .mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_expiry: hoursAgo(1) })
      .mockResolvedValueOnce({ user_id: 'u1', email: 'ana@gmail.com' }) // the flag was null: row updated
    refused()
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toThrow('invalid_grant')
    expect(calls.filter((c) => c.method === 'where').map((c) => c.args)).toContainEqual(['auth_error_at', 'is', null])
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', category: 'account_reauth', data: { accountId: ACCOUNT } }))
    expect(mockNotify.mock.calls[0][0].body).toContain('ana@gmail.com')

    mockTakeFirst
      .mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_expiry: hoursAgo(1) })
      .mockResolvedValueOnce(undefined) // already flagged: nothing updated
    refused()
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toThrow('invalid_grant')
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('leaves the account alone on other failures and does not refresh a valid token', async () => {
    mockTakeFirst.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_expiry: hoursAgo(1) })
    mockGetAccessToken.mockRejectedValueOnce(new Error('ETIMEDOUT'))
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toThrow('ETIMEDOUT')
    expect(calls.some((c) => c.method === 'set')).toBe(false)

    mockTakeFirst.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_expiry: new Date(Date.now() + 3600_000) })
    await getAuthenticatedClient(ACCOUNT)
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1)
  })
})

describe('soft disconnect', () => {
  const sets = () => calls.filter((c) => c.method === 'set').map((c) => c.args[0] as Record<string, unknown>)

  it('DELETE keeps the row (and its archives): Gmail access off, tokens dropped, scoped to the user', async () => {
    const app = await buildApp(authRoutes)
    const res = await app.inject({ method: 'DELETE', url: `/gmail/${ACCOUNT}` })
    await app.close()
    expect(res.statusCode).toBe(204)
    expect(calls.some((c) => c.method === 'deleteFrom')).toBe(false)
    expect(sets()[0]).toMatchObject({ is_active: false, access_token: null, refresh_token: null })
    expect(calls.filter((c) => c.method === 'where').map((c) => c.args)).toContainEqual(['user_id', '=', 'user-1'])
  })

  it('reconnecting the same address reactivates the existing row', async () => {
    mockTakeFirst.mockResolvedValueOnce({ id: ACCOUNT, email: 'a@gmail.com' })
    await exchangeGmailCode('code', 'user-1')
    // Run the upsert's conflict clause against the recording builder
    ;(calls.find((c) => c.method === 'onConflict')?.args[0] as (oc: unknown) => unknown)(chain)
    expect(calls.find((c) => c.method === 'doUpdateSet')?.args[0]).toMatchObject({ is_active: true, auth_error_at: null })
  })

  it('a Gmail call on a disconnected account fails with a clear 409, before any token use', async () => {
    mockTakeFirst.mockResolvedValueOnce({ access_token: null, refresh_token: null, token_expiry: hoursAgo(1), is_active: false })
    await expect(getAuthenticatedClient(ACCOUNT)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('disconnected') })
    expect(mockGetAccessToken).not.toHaveBeenCalled()
  })

  it('cannot be resumed without a reconnection', async () => {
    mockTakeFirst.mockResolvedValueOnce({ id: ACCOUNT, is_active: false, refresh_token: null })
    const app = await buildApp(authRoutes)
    const res = await app.inject({ method: 'PATCH', url: `/gmail/${ACCOUNT}/toggle` })
    await app.close()
    expect(res.statusCode).toBe(409)
    expect(sets()).toHaveLength(0)
  })

  it('the scheduler runs rules of connected accounts only', async () => {
    vi.useFakeTimers()
    mockExecute.mockResolvedValue([])
    startRuleScheduler()
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()
    const wheres = calls.filter((c) => c.method === 'where').map((c) => c.args)
    expect(wheres).toContainEqual(['gmail_accounts.is_active', '=', true])
    expect(wheres).toContainEqual(['gmail_accounts.auth_error_at', 'is', null])
  })
})
