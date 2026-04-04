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

const mockEnqueueJob = vi.fn().mockResolvedValue({ id: 'job-1' })
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
}))

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      messages: {
        list: vi.fn().mockResolvedValue({ data: { messages: [], resultSizeEstimate: 0 } }),
        get: vi.fn().mockResolvedValue({ data: { payload: { parts: [] } } }),
        attachments: { get: vi.fn().mockResolvedValue({ data: { data: '' } }) },
      },
    },
  }),
}))

vi.mock('../gmail/quota.service', () => ({
  getQuotaStats: vi.fn().mockResolvedValue({
    limits: { perSecond: 250, perMinute: 15000 },
    usage: { lastMinute: { units: 0, calls: 0, percentOfLimit: 0 }, lastHour: { units: 0, calls: 0 }, last24h: { units: 0, calls: 0 } },
    topEndpoints: [],
    hourlyBreakdown: [],
  }),
  cleanupOldUsageData: vi.fn().mockResolvedValue(10),
}))

vi.mock('../archive/sharing.service', () => ({
  createShareLink: vi.fn().mockResolvedValue({ id: 'share-1', token: 'abc' }),
  getUserShares: vi.fn().mockResolvedValue([]),
  revokeShare: vi.fn().mockResolvedValue(true),
  getSharedMail: vi.fn().mockResolvedValue({ subject: 'Shared', sender: 'a@b.com' }),
}))

vi.mock('../storage/storage.service', () => ({
  testS3Connection: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../archive/retention.service', () => ({
  getRetentionPolicies: vi.fn().mockResolvedValue([]),
  createRetentionPolicy: vi.fn().mockResolvedValue({ id: 'policy-1', name: 'Test' }),
  updateRetentionPolicy: vi.fn().mockResolvedValue({ id: 'policy-1' }),
  deleteRetentionPolicy: vi.fn(),
  applyRetentionPolicies: vi.fn().mockResolvedValue({ processed: 0 }),
}))

vi.mock('../expiration/expiration.service', () => ({
  getExpirations: vi.fn().mockResolvedValue([]),
  getExpirationStats: vi.fn().mockResolvedValue({ total: 0, pending: 0, deleted: 0, expiringSoon: 0 }),
  createExpiration: vi.fn().mockResolvedValue({ id: 'exp-1' }),
  createExpirationsBatch: vi.fn().mockResolvedValue([]),
  deleteExpiration: vi.fn(),
  updateExpirationDate: vi.fn().mockResolvedValue({ id: 'exp-1' }),
  detectCategory: vi.fn().mockReturnValue('otp'),
  getSuggestedDays: vi.fn().mockReturnValue(1),
}))

vi.mock('../archive/dedup.service', () => ({
  getDeduplicationStats: vi.fn().mockResolvedValue({ totalAttachments: 0 }),
  backfillAttachmentHashes: vi.fn().mockResolvedValue({ processed: 0, failed: 0, duplicatesRemoved: 0 }),
}))

vi.mock('../archive/import.service', () => ({
  importMbox: vi.fn(),
  importImap: vi.fn(),
  exportMbox: vi.fn().mockResolvedValue(new (require('stream').Readable)({ read() { this.push(null) } })),
}))

vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../notifications/notify', () => ({ notify: vi.fn() }))

vi.mock('../config', () => ({
  config: {
    GMAIL_BATCH_SIZE: 10,
    GMAIL_THROTTLE_MS: 0,
    FRONTEND_URL: 'http://localhost:3000',
    ARCHIVE_PATH: '/tmp/archives',
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue(new (require('stream').Readable)({ read() { this.push(null) } })),
  },
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', id: 'user-1', email: 'test@test.com', role: 'admin' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as any)
  return app
}

beforeEach(() => vi.clearAllMocks())

import { quotaRoutes } from '../routes/quota'
import { sharingRoutes } from '../routes/sharing'
import { storageRoutes } from '../routes/storage'
import { retentionRoutes } from '../routes/retention'
import { expirationRoutes } from '../routes/expiration'
import { importRoutes } from '../routes/import'
import { attachmentsRoutes } from '../routes/attachments'

// ═════════════════════════════════════════════════════════
// QUOTA ROUTES
// ═════════════════════════════════════════════════════════
describe('quotaRoutes', () => {
  it('GET /:accountId returns quota stats', async () => {
    const app = await buildTestApp()
    await app.register(quotaRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1' })
    expect(res.statusCode).toBe(200)
    expect(res.json().limits).toBeDefined()
    await app.close()
  })

  it('POST /cleanup returns deleted count', async () => {
    const app = await buildTestApp()
    await app.register(quotaRoutes)
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/cleanup' })
    expect(res.statusCode).toBe(200)
    expect(res.json().deleted).toBe(10)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// SHARING ROUTES
// ═════════════════════════════════════════════════════════
describe('sharingRoutes', () => {
  it('POST / creates share link', async () => {
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { archivedMailId: '550e8400-e29b-41d4-a716-446655440000', expiresInHours: 24 },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('GET / returns user shares', async () => {
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('DELETE /:shareId revokes share', async () => {
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/share-1' })
    expect(res.statusCode).toBe(204)
    await app.close()
  })

  it('DELETE /:shareId returns 404 when not found', async () => {
    const { revokeShare } = await import('../archive/sharing.service')
    ;(revokeShare as any).mockResolvedValueOnce(false)
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/share-1' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /public/:token returns shared mail', async () => {
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const token = 'a'.repeat(64)
    const res = await app.inject({ method: 'GET', url: `/public/${token}` })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /public/:token rejects invalid token format', async () => {
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/public/bad-token' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('GET /public/:token returns 404 when expired', async () => {
    const { getSharedMail } = await import('../archive/sharing.service')
    ;(getSharedMail as any).mockResolvedValueOnce(null)
    const app = await buildTestApp()
    await app.register(sharingRoutes)
    await app.ready()
    const token = 'b'.repeat(64)
    const res = await app.inject({ method: 'GET', url: `/public/${token}` })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// STORAGE ROUTES
// ═════════════════════════════════════════════════════════
describe('storageRoutes', () => {
  it('GET /config returns storage config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'cfg-1', type: 's3', s3_endpoint: 'http://minio:9000',
    })
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json().type).toBe('s3')
    await app.close()
  })

  it('GET /config returns local default when no config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/config' })
    expect(res.statusCode).toBe(200)
    expect(res.json().type).toBe('local')
    await app.close()
  })

  it('PUT /config saves S3 config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null) // no existing config
    mockExecute.mockResolvedValueOnce([]) // insert
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: {
        type: 's3',
        s3Endpoint: 'http://minio:9000',
        s3AccessKeyId: 'key',
        s3SecretAccessKey: 'secret',
      },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PUT /config updates existing config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'cfg-1' }) // existing config
    mockExecute.mockResolvedValueOnce([]) // update
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: {
        type: 's3',
        s3Endpoint: 'http://minio:9000',
        s3AccessKeyId: 'key',
        s3SecretAccessKey: 'secret',
      },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PUT /config rejects S3 without credentials', async () => {
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: { type: 's3' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('PUT /config saves local config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    mockExecute.mockResolvedValueOnce([])
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: { type: 'local' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /test-s3 tests connection', async () => {
    const app = await buildTestApp()
    await app.register(storageRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/test-s3',
      payload: {
        endpoint: 'http://minio:9000',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// RETENTION ROUTES
// ═════════════════════════════════════════════════════════
describe('retentionRoutes', () => {
  it('GET / returns policies', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST / creates policy', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Auto cleanup', maxAgeDays: 90 },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('POST / rejects missing name', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { maxAgeDays: 90 },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST / rejects invalid maxAgeDays', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Test', maxAgeDays: 0 },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('PUT /:policyId updates policy', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PUT',
      url: '/policy-1',
      payload: { name: 'Updated' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('DELETE /:policyId deletes policy', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/policy-1' })
    expect(res.statusCode).toBe(204)
    await app.close()
  })

  it('POST /run triggers retention', async () => {
    const app = await buildTestApp()
    await app.register(retentionRoutes)
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/run' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// EXPIRATION ROUTES
// ═════════════════════════════════════════════════════════
describe('expirationRoutes', () => {
  it('GET /:accountId returns expirations', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/stats returns stats', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().total).toBe(0)
    await app.close()
  })

  it('POST /:accountId creates expiration', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1',
      payload: { gmailMessageId: 'msg-1', expiresInDays: 7 },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('POST /:accountId/batch creates batch', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/batch',
      payload: {
        items: [{ gmailMessageId: 'msg-1', expiresInDays: 3 }],
      },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('POST /:accountId/detect detects temporary emails', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/detect',
      payload: {
        messages: [
          { gmailMessageId: 'msg-1', subject: 'Your OTP code', sender: 'noreply@test.com' },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    await app.close()
  })

  it('PATCH /:accountId/:expirationId updates date', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'PATCH',
      url: '/acc-1/exp-1',
      payload: { expiresAt: '2025-12-31T00:00:00Z' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('DELETE /:accountId/:expirationId deletes expiration', async () => {
    const app = await buildTestApp()
    await app.register(expirationRoutes)
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/acc-1/exp-1' })
    expect(res.statusCode).toBe(204)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// IMPORT ROUTES
// ═════════════════════════════════════════════════════════
describe('importRoutes', () => {
  it('POST /:accountId/mbox uploads mbox file and enqueues job', async () => {
    const app = await buildTestApp()
    // Add content type parser to accept binary
    app.addContentTypeParser('application/octet-stream', function (_req: any, payload: any, done: any) {
      const chunks: Buffer[] = []
      payload.on('data', (chunk: Buffer) => chunks.push(chunk))
      payload.on('end', () => done(null, Buffer.concat(chunks)))
    })
    // Mock request.file() for multipart handling
    app.decorateRequest('file', (async function () {
      const { Readable } = require('stream')
      return {
        file: Readable.from([Buffer.from('From sender@test.com\nSubject: Test\n\nBody')]),
        filename: 'test.mbox',
      }
    }) as any)

    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mbox',
      payload: Buffer.from('From sender@test.com\nSubject: Test\n\nBody'),
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().jobId).toBe('job-1')
    await app.close()
  })

  it('POST /:accountId/mbox returns 400 when no file', async () => {
    const app = await buildTestApp()
    app.addContentTypeParser('application/octet-stream', function (_req: any, payload: any, done: any) {
      const chunks: Buffer[] = []
      payload.on('data', (chunk: Buffer) => chunks.push(chunk))
      payload.on('end', () => done(null, Buffer.concat(chunks)))
    })
    app.decorateRequest('file', (async function () {
      return null
    }) as any)
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mbox',
      payload: Buffer.from(''),
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /:accountId/imap enqueues IMAP import', async () => {
    const app = await buildTestApp()
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/imap',
      payload: {
        host: 'imap.example.com',
        port: 993,
        user: 'user@example.com',
        pass: 'password',
      },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().jobId).toBe('job-1')
    await app.close()
  })

  it('POST /:accountId/imap rejects missing credentials', async () => {
    const app = await buildTestApp()
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/imap',
      payload: { host: 'imap.example.com' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /:accountId/imap uses default port and secure', async () => {
    const app = await buildTestApp()
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/imap',
      payload: {
        host: 'imap.example.com',
        user: 'user@example.com',
        pass: 'password',
        folder: 'Archive',
        maxMessages: 500,
      },
    })
    expect(res.statusCode).toBe(202)
    expect(mockEnqueueJob).toHaveBeenCalledWith('import_imap', expect.objectContaining({
      imapConfig: expect.objectContaining({ port: 993, secure: true, folder: 'Archive', maxMessages: 500 }),
    }))
    await app.close()
  })

  it('POST /:accountId/export-mbox exports mbox stream', async () => {
    const app = await buildTestApp()
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/export-mbox',
      payload: { mailIds: ['mail-1', 'mail-2'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/mbox')
    await app.close()
  })

  it('POST /:accountId/export-mbox works without mailIds', async () => {
    const app = await buildTestApp()
    await app.register(importRoutes)
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/export-mbox',
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═════════════════════════════════════════════════════════
// ATTACHMENTS ROUTES
// ═════════════════════════════════════════════════════════
describe('attachmentsRoutes', () => {
  it('GET /:accountId/archived returns paginated attachments', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'att-1', filename: 'test.pdf' }])
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ total_size: 1024 })
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived' })
    expect(res.statusCode).toBe(200)
    expect(res.json().attachments).toBeDefined()
    expect(res.json().total).toBe(1)
    await app.close()
  })

  it('GET /:accountId/archived with search query', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ total_size: 0 })
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived?q=test&sort=date&order=asc' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /dedup-stats returns dedup stats', async () => {
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/dedup-stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().totalAttachments).toBe(0)
    await app.close()
  })

  it('POST /dedup-backfill runs backfill', async () => {
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/dedup-backfill' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/archived/:attachmentId/download returns file', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'att-1',
      filename: 'test.pdf',
      mime_type: 'application/pdf',
      file_path: '/tmp/test.pdf',
    })
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived/att-1/download' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    await app.close()
  })

  it('GET /:accountId/archived/:attachmentId/download returns 404 when not found', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived/att-1/download' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /:accountId/archived/:attachmentId/download inline', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'att-1',
      filename: 'test.pdf',
      mime_type: 'application/pdf',
      file_path: '/tmp/test.pdf',
    })
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived/att-1/download?inline=1' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('inline')
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download rejects missing filename', async () => {
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('GET /:accountId/archived/:attachmentId/download returns 404 when file not on disk', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'att-1',
      filename: 'test.pdf',
      mime_type: 'application/pdf',
      file_path: '/tmp/missing.pdf',
    })
    const fsModule = await import('fs')
    ;(fsModule.default.existsSync as any).mockReturnValueOnce(false)

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/archived/att-1/download' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toContain('File not found')
    await app.close()
  })

  it('GET /:accountId/live returns attachment list from Gmail', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          list: vi.fn().mockResolvedValue({
            data: {
              messages: [{ id: 'gm-1' }],
            },
          }),
          get: vi.fn().mockResolvedValue({
            data: {
              id: 'gm-1',
              sizeEstimate: 5000,
              payload: {
                headers: [
                  { name: 'Subject', value: 'Test' },
                  { name: 'From', value: 'sender@test.com' },
                  { name: 'Date', value: '2024-01-15' },
                ],
                parts: [
                  { filename: 'doc.pdf', mimeType: 'application/pdf', body: { size: 2048 } },
                ],
              },
            },
          }),
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live?maxResults=10' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].filename).toBe('doc.pdf')
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download downloads attachment by attachmentId', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          get: vi.fn().mockResolvedValue({
            data: {
              payload: {
                parts: [
                  { filename: 'test.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att-id-1' } },
                ],
              },
            },
          }),
          attachments: {
            get: vi.fn().mockResolvedValue({
              data: { data: Buffer.from('pdf content').toString('base64') },
            }),
          },
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download?filename=test.pdf' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download returns 404 when part not found', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          get: vi.fn().mockResolvedValue({
            data: { payload: { parts: [] } },
          }),
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download?filename=missing.pdf' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download with inline body data', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          get: vi.fn().mockResolvedValue({
            data: {
              payload: {
                parts: [
                  { filename: 'inline.txt', mimeType: 'text/plain', body: { data: Buffer.from('hello').toString('base64url') } },
                ],
              },
            },
          }),
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download?filename=inline.txt&inline=1' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('inline')
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download returns 404 when no body data', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          get: vi.fn().mockResolvedValue({
            data: {
              payload: {
                parts: [
                  { filename: 'empty.bin', mimeType: 'application/octet-stream', body: {} },
                ],
              },
            },
          }),
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download?filename=empty.bin' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toContain('No attachment data')
    await app.close()
  })

  it('GET /:accountId/live/:messageId/download finds nested part', async () => {
    const { getGmailClient } = await import('../gmail/gmail.service')
    ;(getGmailClient as any).mockResolvedValueOnce({
      users: {
        messages: {
          get: vi.fn().mockResolvedValue({
            data: {
              payload: {
                parts: [
                  {
                    filename: '',
                    parts: [
                      { filename: 'nested.pdf', mimeType: 'application/pdf', body: { data: Buffer.from('pdf').toString('base64url') } },
                    ],
                  },
                ],
              },
            },
          }),
        },
      },
    })

    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/acc-1/live/msg-1/download?filename=nested.pdf' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
