import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

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

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getQueue: vi.fn(),
}))
vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn(),
  getMessage: vi.fn(),
  getMessageFull: vi.fn(),
  batchGetMessages: vi.fn(),
  trashMessages: vi.fn(),
  modifyMessages: vi.fn(),
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  getMailboxProfile: vi.fn(),
  getGmailClient: vi.fn(),
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../notifications/notify', () => ({ notify: vi.fn() }))
vi.mock('../archive/export.service', () => ({
  streamArchiveZip: vi.fn().mockImplementation((_a, _b, stream) => {
    stream.end()
    return Promise.resolve()
  }),
}))
vi.mock('../dashboard/cache.service', () => ({
  getCachedStats: vi.fn(),
  setCachedStats: vi.fn(),
  getCachedArchiveStats: vi.fn(),
  setCachedArchiveStats: vi.fn(),
  invalidateDashboardCache: vi.fn(),
}))
vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue({
    deleteFile: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('../config', () => ({
  config: { GMAIL_BATCH_SIZE: 10, GMAIL_THROTTLE_MS: 0, FRONTEND_URL: 'http://localhost:3000' },
}))

import { archiveRoutes } from '../routes/archive'

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'admin' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  app.decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), setex: vi.fn() } as any)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('archiveRoutes — trash coverage gaps', () => {
  it('GET /:accountId/trash with search query q', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([{ id: 'mail-1', deleted_at: '2026-03-30T10:00:00Z' }])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '14' })

    const res = await app.inject({ method: 'GET', url: '/acc-1/trash?q=important' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.retentionDays).toBe(14)
    await app.close()
  })

  it('GET /:accountId/trash returns default retentionDays when no config', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined) // no config row

    const res = await app.inject({ method: 'GET', url: '/acc-1/trash' })
    expect(res.statusCode).toBe(200)
    expect(res.json().retentionDays).toBe(30)
    await app.close()
  })

  it('DELETE /:accountId/trash with mails deletes files and records', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    // Mails in trash
    mockExecute.mockResolvedValueOnce([
      { id: 'mail-1', eml_path: '/tmp/mail-1.eml', gmail_account_id: 'acc-1' },
    ])
    // Attachments
    mockExecute.mockResolvedValueOnce([
      { id: 'att-1', file_path: '/tmp/att-1.pdf' },
    ])
    // Delete attachments from DB
    mockExecute.mockResolvedValueOnce(undefined)
    // Delete mails from DB
    mockExecute.mockResolvedValueOnce(undefined)

    const res = await app.inject({ method: 'DELETE', url: '/acc-1/trash' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ deleted: 1 })
    await app.close()
  })

  it('PUT /config/trash with only retentionDays', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'PUT',
      url: '/config/trash',
      payload: { retentionDays: 7 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })

  it('PUT /config/trash with only purgeEnabled', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'PUT',
      url: '/config/trash',
      payload: { purgeEnabled: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })

  it('GET /:accountId/mails with full-text search and filters', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([{ id: 'mail-1', subject: 'Found' }])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?q=test&sender=foo@bar.com&has_attachments=true',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/mails with date filters', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?from_date=2026-01-01&to_date=2026-06-01&has_attachments=false',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
