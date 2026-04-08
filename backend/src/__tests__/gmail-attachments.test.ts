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

const mockAttachmentGet = vi.fn()
const mockGetGmailClient = vi.fn().mockResolvedValue({
  users: {
    messages: {
      attachments: {
        get: (...args: any[]) => mockAttachmentGet(...args),
      },
    },
  },
})

vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [], nextPageToken: null, resultSizeEstimate: 0 }),
  getMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  getMessageFull: vi.fn().mockResolvedValue({ id: 'msg-1', body: 'full' }),
  batchGetMessages: vi.fn().mockResolvedValue([]),
  listLabels: vi.fn().mockResolvedValue([]),
  createLabel: vi.fn().mockResolvedValue({ id: 'label-1', name: 'New' }),
  deleteLabel: vi.fn(),
  getMailboxProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com' }),
  getGmailClient: (...args: any[]) => mockGetGmailClient(...args),
  trashMessages: vi.fn(),
  modifyMessages: vi.fn(),
}))

vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../config', () => ({
  config: { GMAIL_BATCH_SIZE: 10, GMAIL_THROTTLE_MS: 0, FRONTEND_URL: 'http://localhost:3000' },
}))

import { gmailRoutes } from '../routes/gmail'

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

describe('gmailRoutes — attachment endpoint', () => {
  it('GET /:accountId/messages/:messageId/attachments/:attachmentId returns attachment data', async () => {
    mockAttachmentGet.mockResolvedValueOnce({
      data: { data: 'SGVsbG8gV29ybGQ', size: 11 },
    })

    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/messages/msg-1/attachments/att-1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toBe('SGVsbG8gV29ybGQ')
    expect(body.size).toBe(11)
    expect(mockGetGmailClient).toHaveBeenCalledWith('acc-1')
    expect(mockAttachmentGet).toHaveBeenCalledWith({
      userId: 'me',
      messageId: 'msg-1',
      id: 'att-1',
    })

    await app.close()
  })

  it('returns 500 when Gmail API fails', async () => {
    mockAttachmentGet.mockRejectedValueOnce(new Error('Gmail API error'))

    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/acc-1/messages/msg-1/attachments/att-1',
    })

    expect(res.statusCode).toBe(500)
    await app.close()
  })
})
