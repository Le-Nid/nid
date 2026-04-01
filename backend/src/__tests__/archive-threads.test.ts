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

// Mock kysely sql tagged template
const mockSqlExecute = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('kysely', async () => {
  const actual = await vi.importActual<typeof import('kysely')>('kysely')
  return {
    ...actual,
    sql: new Proxy(
      function () { return { execute: mockSqlExecute } },
      {
        apply: () => ({ execute: mockSqlExecute }),
        get: (_target, prop) => {
          if (prop === 'execute') return mockSqlExecute
          return (..._args: any[]) => ({ execute: mockSqlExecute })
        },
      }
    ),
  }
})

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getQueue: vi.fn(),
}))
vi.mock('../archive/export.service', () => ({
  streamArchiveZip: vi.fn().mockImplementation((_a, _b, stream) => { stream.end(); return Promise.resolve() }),
}))
vi.mock('../dashboard/cache.service', () => ({ invalidateDashboardCache: vi.fn() }))
vi.mock('../config', () => ({
  config: { FRONTEND_URL: 'http://localhost:3000', ALLOW_REGISTRATION: true },
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), del: vi.fn() }),
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'admin' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  return app
}

beforeEach(() => vi.clearAllMocks())

import { archiveRoutes } from '../routes/archive'

describe('archiveRoutes - threads coverage', () => {
  it('GET /:accountId/threads returns thread list', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 2 })
    mockSqlExecute.mockResolvedValueOnce({
      rows: [
        { thread_id: 't1', message_count: 3, latest_date: new Date(), senders: ['a@b.com'], total_size: 1024, has_attachments: false, id: 'm1', subject: 'Test', sender: 'a@b.com', snippet: 'hi', date: new Date(), archived_at: new Date() },
      ],
    })

    const res = await app.inject({ method: 'GET', url: '/acc-1/threads' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.threads).toHaveLength(1)
    expect(body.total).toBe(2)
    await app.close()
  })

  it('GET /:accountId/threads with filters', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    mockSqlExecute.mockResolvedValueOnce({ rows: [] })

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/threads?q=test&sender=a@b.com&from_date=2024-01-01&to_date=2024-12-31&has_attachments=true&page=1&limit=10',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/threads with has_attachments=false', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    mockSqlExecute.mockResolvedValueOnce({ rows: [] })

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/threads?has_attachments=false',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/threads/:threadId returns thread mails with attachments', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute
      .mockResolvedValueOnce([
        { id: 'm1', thread_id: 't1', subject: 'A', date: new Date() },
        { id: 'm2', thread_id: 't1', subject: 'B', date: new Date() },
      ]) // mails
      .mockResolvedValueOnce([
        { id: 'att1', archived_mail_id: 'm1', filename: 'doc.pdf' },
      ]) // attachments

    const res = await app.inject({ method: 'GET', url: '/acc-1/threads/t1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body[0].attachments).toHaveLength(1)
    expect(body[1].attachments).toHaveLength(0)
    await app.close()
  })

  it('GET /:accountId/threads/:threadId with no mails', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([]) // no mails

    const res = await app.inject({ method: 'GET', url: '/acc-1/threads/nonexistent' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
    await app.close()
  })
})
