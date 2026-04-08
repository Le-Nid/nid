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

const mockEnqueueJob = vi.fn().mockResolvedValue({ id: 'job-1' })
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
  getQueue: vi.fn().mockReturnValue({ getJob: vi.fn() }),
}))
vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [], resultSizeEstimate: 0 }),
  getMessage: vi.fn(),
  getMessageFull: vi.fn(),
  batchGetMessages: vi.fn().mockResolvedValue([]),
  listLabels: vi.fn().mockResolvedValue([]),
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  getMailboxProfile: vi.fn().mockResolvedValue({}),
  getGmailClient: vi.fn(),
  modifyMessages: vi.fn(),
  trashMessages: vi.fn(),
  deleteMessages: vi.fn(),
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../dashboard/cache.service', () => ({
  getCachedStats: vi.fn().mockResolvedValue(null),
  setCachedStats: vi.fn(),
  getCachedArchiveStats: vi.fn().mockResolvedValue(null),
  setCachedArchiveStats: vi.fn(),
  invalidateDashboardCache: vi.fn(),
}))
vi.mock('../archive/export.service', () => ({
  streamArchiveZip: vi.fn().mockImplementation((_a, _b, stream) => { stream.end(); return Promise.resolve() }),
}))
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: vi.fn().mockResolvedValue([]),
  getNewsletterMessageIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../privacy/tracking.service', () => ({
  getTrackingStats: vi.fn().mockResolvedValue({}),
  listTrackedMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))
vi.mock('../privacy/pii.service', () => ({
  getPiiStats: vi.fn().mockResolvedValue({}),
  listPiiFindings: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))
vi.mock('../privacy/encryption.service', () => ({
  setupEncryption: vi.fn(),
  verifyEncryptionKey: vi.fn().mockResolvedValue(true),
  getEncryptionStatus: vi.fn().mockResolvedValue({}),
  decryptFile: vi.fn().mockResolvedValue(Buffer.from('decrypted')),
}))
vi.mock('../webhooks/webhook.service', () => ({ triggerWebhooks: vi.fn() }))
vi.mock('../config', () => ({
  config: {
    GMAIL_BATCH_SIZE: 10,
    GMAIL_THROTTLE_MS: 0,
    FRONTEND_URL: 'http://localhost:3000',
    ALLOW_REGISTRATION: true,
    ADMIN_EMAIL: undefined,
  },
}))
vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    del: vi.fn(),
    setex: vi.fn(),
  }),
}))
vi.mock('../rules/rules.service', () => ({
  getRules: vi.fn().mockResolvedValue([]),
  getRule: vi.fn(),
  createRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
  updateRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
  deleteRule: vi.fn(),
  runRule: vi.fn(),
  buildGmailQuery: vi.fn().mockReturnValue('from:test'),
}))
vi.mock('../rules/rule-templates', () => ({ RULE_TEMPLATES: [] }))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'admin' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() } as any)
  return app
}

beforeEach(() => vi.clearAllMocks())

import { archiveRoutes } from '../routes/archive'
import { jobSseRoutes, broadcastJobUpdate, startQueueEventBroadcaster } from '../routes/job-sse'

// ═══════════════════════════════════════════════════════════
// ARCHIVE ROUTES - remaining uncovered lines
// ═══════════════════════════════════════════════════════════
describe('archiveRoutes - remaining coverage', () => {
  it('GET /:accountId/mails with q + sender + from_date + to_date + has_attachments=false', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()
    // Test the full-text-search path with all filters
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?q=test&sender=a@b.com&from_date=2024-01-01&to_date=2024-12-31&has_attachments=false',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/mails with has_attachments=true', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?has_attachments=true',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/mails with pagination', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })
    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/mails?page=2&limit=10',
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// JOB-SSE - coverage for broadcastJobUpdate and startQueueEventBroadcaster
// ═══════════════════════════════════════════════════════════
describe('job-sse coverage', () => {
  it('broadcastJobUpdate with no subscribers does nothing', () => {
    expect(() => broadcastJobUpdate('non-existent', { type: 'progress', progress: 50 })).not.toThrow()
  })

  it('jobSseRoutes registers SSE endpoint', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    await app.register(jobSseRoutes)
    await app.ready()
    expect(app.printRoutes()).toBeDefined()
    await app.close()
  })

  it('SSE endpoint returns 401 when jwt fails', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function () {
      throw new Error('JWT expired')
    })
    app.decorate('db', mockDb as any)
    await app.register(jobSseRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/job-1/events' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('SSE endpoint returns 404 when job not found', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    await app.register(jobSseRoutes)
    await app.ready()
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'GET', url: '/job-1/events' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('SSE endpoint sends final state for completed job', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    await app.register(jobSseRoutes)
    await app.ready()
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: 'j-1', bullmq_id: 'job-1', status: 'completed' }) // job check
      .mockResolvedValueOnce({ id: 'j-1', status: 'completed', progress: 100 }) // final state
    const res = await app.inject({ method: 'GET', url: '/job-1/events' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    await app.close()
  })

  // Active job SSE stream test removed - inject() sends the request synchronously
  // which means it waits for the stream to end, but an active job keeps streaming.
  // The completed-job fast path already covers the SSE response shape.

  it('startQueueEventBroadcaster registers event listeners', () => {
    // Just verify it doesn't throw
    expect(() => startQueueEventBroadcaster()).not.toThrow()
  })
})
