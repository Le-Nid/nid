import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

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

// Mock kysely's `sql` tagged template — this is the key!
// sql`...`.execute(db) → { rows: [...] }
const mockSqlExecute = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('kysely', async () => {
  const actual = await vi.importActual<typeof import('kysely')>('kysely')
  return {
    ...actual,
    sql: new Proxy(
      function () {
        return { execute: mockSqlExecute }
      },
      {
        apply: () => ({ execute: mockSqlExecute }),
        get: (_target, prop) => {
          if (prop === 'execute') return mockSqlExecute
          // Handle sql tagged template call: sql`...`
          return (..._args: any[]) => ({ execute: mockSqlExecute })
        },
      }
    ),
  }
})

vi.mock('../config', () => ({
  config: {
    ALLOW_REGISTRATION: true,
    ADMIN_EMAIL: undefined,
    FRONTEND_URL: 'http://localhost:3000',
  },
}))

vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

async function buildAdminApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'admin-1', email: 'admin@test.com', role: 'admin' }
  })
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)

  const { adminRoutes } = await import('../routes/admin')
  await app.register(adminRoutes)
  await app.ready()
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('adminRoutes - full coverage with sql mock', () => {
  // ─── GET /users ─────────────────────────────────────────
  it('GET /users returns paginated user list with accounts & storage', async () => {
    const app = await buildAdminApp()
    mockExecute.mockResolvedValueOnce([
      { id: 'u1', email: 'a@test.com', role: 'user', display_name: null, avatar_url: null, is_active: true, max_gmail_accounts: 3, storage_quota_bytes: 0, last_login_at: null, created_at: new Date() },
    ])
    mockSqlExecute
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // total users
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1', count: 2 }] }) // gmail accounts
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1', total: '1024' }] }) // storage

    const res = await app.inject({ method: 'GET', url: '/users' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.users).toHaveLength(1)
    expect(body.users[0].gmail_accounts_count).toBe(2)
    expect(body.users[0].storage_used_bytes).toBe(1024)
    expect(body.total).toBe(1)
    await app.close()
  })

  it('GET /users with search parameter', async () => {
    const app = await buildAdminApp()
    mockExecute.mockResolvedValueOnce([])
    mockSqlExecute
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await app.inject({ method: 'GET', url: '/users?search=test' })
    expect(res.statusCode).toBe(200)
    expect(res.json().total).toBe(0)
    await app.close()
  })

  it('GET /users with pagination', async () => {
    const app = await buildAdminApp()
    mockExecute.mockResolvedValueOnce([])
    mockSqlExecute
      .mockResolvedValueOnce({ rows: [{ count: 50 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await app.inject({ method: 'GET', url: '/users?page=2&limit=10' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.page).toBe(2)
    expect(body.limit).toBe(10)
    await app.close()
  })

  // ─── GET /users/:userId ─────────────────────────────────
  it('GET /users/:userId returns user detail with accounts and jobs', async () => {
    const app = await buildAdminApp()
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'u1', email: 'a@test.com', role: 'user',
    })
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1', email: 'g@gmail.com' }]) // accounts
      .mockResolvedValueOnce([{ id: 'job-1', type: 'archive_mails' }]) // jobs

    const res = await app.inject({ method: 'GET', url: '/users/u1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.gmailAccounts).toHaveLength(1)
    expect(body.recentJobs).toHaveLength(1)
    await app.close()
  })

  it('GET /users/:userId returns 404 when user not found', async () => {
    const app = await buildAdminApp()
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'GET', url: '/users/nonexistent' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  // ─── PATCH /users/:userId ──────────────────────────────
  it('PATCH /users/:userId updates user', async () => {
    const app = await buildAdminApp()
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'u1', email: 'a@test.com', role: 'admin', is_active: true,
    })
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/u1',
      payload: { role: 'admin', is_active: true },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /users/:userId returns 400 when no fields', async () => {
    const app = await buildAdminApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/u1',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('PATCH /users/:userId returns 404 when user not found', async () => {
    const app = await buildAdminApp()
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/u1',
      payload: { role: 'user' },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  // ─── GET /jobs ──────────────────────────────────────────
  it('GET /jobs returns jobs with count', async () => {
    const app = await buildAdminApp()
    mockExecute.mockResolvedValueOnce([{ id: 'j1', type: 'archive_mails', user_email: 'a@test.com' }])
    mockSqlExecute.mockResolvedValueOnce({ rows: [{ count: 1 }] })

    const res = await app.inject({ method: 'GET', url: '/jobs' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.jobs).toHaveLength(1)
    expect(body.total).toBe(1)
    await app.close()
  })

  it('GET /jobs with status filter', async () => {
    const app = await buildAdminApp()
    mockExecute.mockResolvedValueOnce([])
    mockSqlExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] })

    const res = await app.inject({ method: 'GET', url: '/jobs?status=completed' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  // ─── GET /stats ────────────────────────────────────────
  it('GET /stats returns global statistics', async () => {
    const app = await buildAdminApp()
    mockSqlExecute
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // users
      .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // accounts
      .mockResolvedValueOnce({ rows: [{ total: 100, completed: 80, failed: 5, active: 15 }] }) // jobs
      .mockResolvedValueOnce({ rows: [{ total_mails: 1000, total_size: '5000000' }] }) // archives

    const res = await app.inject({ method: 'GET', url: '/stats' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.users).toBe(10)
    expect(body.gmailAccounts).toBe(5)
    expect(body.jobs.total).toBe(100)
    expect(body.archives.totalMails).toBe(1000)
    await app.close()
  })
})
