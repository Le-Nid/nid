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
  getLocalStorage: vi.fn().mockReturnValue({
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

describe('archiveRoutes — tags', () => {
  it('GET /:accountId/tags lists tags with numeric counts', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    mockExecute.mockResolvedValueOnce([{ tag: 'Factures', count: '3' }])
    const res = await app.inject({ method: 'GET', url: '/acc-1/tags' })
    expect(res.json()).toEqual([{ tag: 'Factures', count: 3 }])
    await app.close()
  })

  it('POST /:accountId/mails/tags adds and removes on the selection', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 2n })
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mails/tags',
      payload: { mailIds: ['00000000-0000-4000-8000-000000000001'], add: [' Factures '], remove: ['old'] },
    })
    expect(res.json()).toEqual({ updated: 2 })
    await app.close()
  })

  it('POST /:accountId/mails/tags refuses a tag with a comma', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mails/tags',
      payload: { mailIds: ['00000000-0000-4000-8000-000000000001'], add: ['a,b'] },
    })
    expect(res.statusCode).not.toBe(200)
    expect(mockExecuteTakeFirst).not.toHaveBeenCalled()
    await app.close()
  })

  it('DELETE /:accountId/tags/:tag drops the tag everywhere', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 5n })
    const res = await app.inject({ method: 'DELETE', url: '/acc-1/tags/Factures' })
    expect(res.json()).toEqual({ updated: 5 })
    await app.close()
  })

  it('GET /:accountId/mails filters by tag', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    mockExecute.mockResolvedValueOnce([{ id: 'm1', tags: ['Factures'] }])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })
    const res = await app.inject({ method: 'GET', url: '/acc-1/mails?tag=Factures' })
    expect(res.json()).toMatchObject({ total: 1, mails: [{ id: 'm1', tags: ['Factures'] }] })
    await app.close()
  })
})
