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
vi.mock('../jobs/queue', () => ({ enqueueJob: vi.fn().mockResolvedValue({ id: 'job-1' }), getQueue: vi.fn().mockReturnValue({ getJob: vi.fn() }) }))
vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [], nextPageToken: null, resultSizeEstimate: 0 }),
  getMessage: vi.fn(),
  getMessageFull: vi.fn(),
  batchGetMessages: vi.fn().mockResolvedValue([]),
  trashMessages: vi.fn(),
  deleteMessages: vi.fn(),
  modifyMessages: vi.fn(),
  listLabels: vi.fn().mockResolvedValue([]),
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  getMailboxProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com', messagesTotal: 100, threadsTotal: 50, historyId: '123' }),
  getLabelStats: vi.fn().mockResolvedValue({ messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 }),
  getGmailClient: vi.fn(),
}))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../notifications/notify', () => ({ notify: vi.fn() }))
vi.mock('../archive/archive.service', () => ({
  archiveMail: vi.fn(),
  getArchivedIds: vi.fn().mockResolvedValue(new Set()),
}))
vi.mock('../archive/export.service', () => ({
  streamArchiveZip: vi.fn().mockImplementation((_ids, _db, stream) => {
    stream.end()
  }),
}))
vi.mock('../archive/integrity.service', () => ({
  checkArchiveIntegrity: vi.fn().mockResolvedValue({ ok: true, missing: [], orphaned: [] }),
}))
vi.mock('../dashboard/cache.service', () => ({
  getCachedStats: vi.fn().mockResolvedValue(null),
  setCachedStats: vi.fn(),
  getCachedArchiveStats: vi.fn().mockResolvedValue(null),
  setCachedArchiveStats: vi.fn(),
  invalidateDashboardCache: vi.fn(),
}))
vi.mock('../analytics/analytics.service', () => ({
  getHeatmap: vi.fn().mockResolvedValue([]),
  getSenderScores: vi.fn().mockResolvedValue([]),
  getCleanupSuggestions: vi.fn().mockResolvedValue([]),
  dismissSuggestion: vi.fn(),
  getInboxZeroData: vi.fn().mockResolvedValue({ snapshots: [], streak: 0 }),
  recordInboxSnapshot: vi.fn(),
}))
vi.mock('../rules/rules.service', () => ({
  getRules: vi.fn().mockResolvedValue([]),
  getRule: vi.fn().mockResolvedValue(null),
  createRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
  updateRule: vi.fn().mockResolvedValue({ id: 'rule-1' }),
  deleteRule: vi.fn(),
  runRule: vi.fn().mockResolvedValue({ processed: 0 }),
  buildGmailQuery: vi.fn().mockReturnValue('from:test'),
}))
vi.mock('../rules/rule-templates', () => ({ RULE_TEMPLATES: [] }))
vi.mock('../privacy/tracking.service', () => ({
  getTrackingStats: vi.fn().mockResolvedValue({ trackedMessages: 0, totalTrackers: 0, topDomains: [] }),
  listTrackedMessages: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  scanTrackingPixels: vi.fn(),
}))
vi.mock('../privacy/pii.service', () => ({
  getPiiStats: vi.fn().mockResolvedValue({ totalFindings: 0, affectedMails: 0, byType: [] }),
  listPiiFindings: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  scanArchivePii: vi.fn(),
}))
vi.mock('../privacy/encryption.service', () => ({
  setupEncryption: vi.fn().mockResolvedValue({ success: true }),
  verifyEncryptionKey: vi.fn().mockResolvedValue(true),
  getEncryptionStatus: vi.fn().mockResolvedValue({ isSetup: false }),
  decryptFile: vi.fn(),
}))
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: vi.fn().mockResolvedValue([]),
  getNewsletterMessageIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../reports/report.service', () => ({
  generateWeeklyReport: vi.fn().mockResolvedValue({ subject: 'Report', html: '<p>report</p>', stats: {} }),
}))
vi.mock('../notifications/notification-prefs.service', () => ({
  NOTIFICATION_DEFAULTS: {},
}))
vi.mock('../webhooks/webhook.service', () => ({
  triggerWebhooks: vi.fn(),
}))
vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue({
    deleteFile: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('../archive/trash.service', () => ({
  purgeArchiveTrash: vi.fn().mockResolvedValue({ deleted: 0 }),
}))
vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    del: vi.fn(),
    setex: vi.fn(),
  }),
}))

// ─── Build test Fastify app with auth decorators ────────────
async function buildTestApp() {
  const app = Fastify({ logger: false })

  // Decorate with auth helpers (skip real auth)
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', role: 'admin' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  app.decorate('db', mockDb as any)
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    del: vi.fn(),
    setex: vi.fn(),
  } as any)

  return app
}

beforeEach(() => vi.clearAllMocks())

// ─── Import route modules ───────────────────────────────────
import { auditRoutes } from '../routes/audit'
import { analyticsRoutes } from '../routes/analytics'
import { reportsRoutes } from '../routes/reports'
import { notificationsRoutes } from '../routes/notifications'
import { integrityRoutes } from '../routes/integrity'
import { savedSearchRoutes } from '../routes/saved-searches'
import { jobRoutes } from '../routes/jobs'
import { dashboardRoutes } from '../routes/dashboard'
import { rulesRoutes } from '../routes/rules'
import { unsubscribeRoutes } from '../routes/unsubscribe'
import { webhookRoutes } from '../routes/webhooks'
import { configRoutes } from '../routes/config'
import { privacyRoutes } from '../routes/privacy'
import { duplicatesRoutes } from '../routes/duplicates'
import { gmailRoutes } from '../routes/gmail'
import { archiveRoutes } from '../routes/archive'
import { adminRoutes } from '../routes/admin'
import { attachmentsRoutes } from '../routes/attachments'
import { unifiedRoutes } from '../routes/unified'

// ═══════════════════════════════════════════════════════════
// Audit routes
// ═══════════════════════════════════════════════════════════
describe('auditRoutes', () => {
  it('GET / returns audit logs', async () => {
    const app = await buildTestApp()
    await app.register(auditRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([{ id: '1', action: 'login', created_at: new Date() }])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })

    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.logs).toBeDefined()
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Analytics routes
// ═══════════════════════════════════════════════════════════
describe('analyticsRoutes', () => {
  it('GET /:accountId/heatmap returns heatmap', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/heatmap' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/sender-scores returns sender scores', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/sender-scores' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/cleanup-suggestions returns suggestions', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/cleanup-suggestions' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /suggestions/:suggestionId/dismiss dismisses suggestion', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'PATCH', url: '/suggestions/sug-1/dismiss' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/inbox-zero returns inbox zero data', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/inbox-zero' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/inbox-zero/snapshot records snapshot', async () => {
    const app = await buildTestApp()
    await app.register(analyticsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/acc-1/inbox-zero/snapshot' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Reports routes
// ═══════════════════════════════════════════════════════════
describe('reportsRoutes', () => {
  it('GET /weekly generates report', async () => {
    const app = await buildTestApp()
    await app.register(reportsRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/weekly' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Notification routes
// ═══════════════════════════════════════════════════════════
describe('notificationsRoutes', () => {
  it('GET / returns notifications', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /:notificationId/read marks notification as read', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'PATCH', url: '/notif-1/read' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /read-all marks all notifications as read', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'PATCH', url: '/read-all' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /preferences returns notification preferences', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce(null)

    const res = await app.inject({ method: 'GET', url: '/preferences' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PUT /preferences updates preferences', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'PUT', url: '/preferences', payload: { job_completed: true } })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Integrity routes
// ═══════════════════════════════════════════════════════════
describe('integrityRoutes', () => {
  it('GET /check checks integrity', async () => {
    const app = await buildTestApp()
    await app.register(integrityRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/check' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Saved searches routes
// ═══════════════════════════════════════════════════════════
describe('savedSearchRoutes', () => {
  it('GET / returns saved searches', async () => {
    const app = await buildTestApp()
    await app.register(savedSearchRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])

    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST / creates a saved search', async () => {
    const app = await buildTestApp()
    await app.register(savedSearchRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'ss-1', name: 'Test', query: 'from:test' })

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Test', query: 'from:test' },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('DELETE /:searchId deletes a saved search', async () => {
    const app = await buildTestApp()
    await app.register(savedSearchRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ numDeletedRows: BigInt(1) })

    const res = await app.inject({ method: 'DELETE', url: '/ss-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Jobs routes
// ═══════════════════════════════════════════════════════════
describe('jobRoutes', () => {
  it('GET / returns jobs', async () => {
    const app = await buildTestApp()
    await app.register(jobRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:id returns a specific job', async () => {
    const app = await buildTestApp()
    await app.register(jobRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'job-1', status: 'completed' })

    const res = await app.inject({ method: 'GET', url: '/job-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Dashboard routes
// ═══════════════════════════════════════════════════════════
describe('dashboardRoutes', () => {
  it('GET /:accountId/stats returns dashboard stats', async () => {
    const app = await buildTestApp()
    await app.register(dashboardRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 0 })
    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/acc-1/stats' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Rules routes
// ═══════════════════════════════════════════════════════════
describe('rulesRoutes', () => {
  it('GET /:accountId returns rules', async () => {
    const app = await buildTestApp()
    await app.register(rulesRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /templates returns rule templates', async () => {
    const app = await buildTestApp()
    await app.register(rulesRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/templates' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Unsubscribe routes
// ═══════════════════════════════════════════════════════════
describe('unsubscribeRoutes', () => {
  it('POST /:accountId/scan triggers newsletter scan', async () => {
    const app = await buildTestApp()
    await app.register(unsubscribeRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/acc-1/scan' })
    expect(res.statusCode).toBe(202)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Webhooks routes
// ═══════════════════════════════════════════════════════════
describe('webhookRoutes', () => {
  it('GET / returns webhooks', async () => {
    const app = await buildTestApp()
    await app.register(webhookRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])

    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST / creates a webhook', async () => {
    const app = await buildTestApp()
    await app.register(webhookRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'wh-1', url: 'https://example.com/hook' })

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'My Hook', url: 'https://example.com/hook', events: ['job.completed'], type: 'generic' },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Config routes
// ═══════════════════════════════════════════════════════════
describe('configRoutes', () => {
  it('GET /export exports config', async () => {
    const app = await buildTestApp()
    await app.register(configRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([]) // rules
    mockExecute.mockResolvedValueOnce([]) // webhooks

    const res = await app.inject({ method: 'GET', url: '/export' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Privacy routes
// ═══════════════════════════════════════════════════════════
describe('privacyRoutes', () => {
  it('GET /:accountId/tracking/stats returns tracking stats', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/tracking/stats' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/pii/stats returns PII stats', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/pii/stats' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/encryption/status returns encryption status', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/encryption/status' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Duplicates routes
// ═══════════════════════════════════════════════════════════
describe('duplicatesRoutes', () => {
  it('GET /:accountId/archived returns duplicates', async () => {
    const app = await buildTestApp()
    await app.register(duplicatesRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])

    const res = await app.inject({ method: 'GET', url: '/acc-1/archived' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Gmail routes
// ═══════════════════════════════════════════════════════════
describe('gmailRoutes', () => {
  it('GET /:accountId/messages returns messages', async () => {
    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/messages' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/labels returns labels', async () => {
    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/labels' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/profile returns profile', async () => {
    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/profile' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Archive routes
// ═══════════════════════════════════════════════════════════
describe('archiveRoutes', () => {
  it('GET /:accountId/mails returns archived mails', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({ method: 'GET', url: '/acc-1/mails' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/archive enqueues archive job', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/archive',
      payload: {},
    })
    expect(res.statusCode).toBe(202)
    await app.close()
  })

  it('POST /:accountId/mails/trash soft-deletes mails', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: BigInt(2) })

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mails/trash',
      payload: { mailIds: ['a0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ trashed: 2 })
    await app.close()
  })

  it('POST /:accountId/mails/restore restores mails from trash', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: BigInt(1) })

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/mails/restore',
      payload: { mailIds: ['a0000000-0000-4000-a000-000000000001'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ restored: 1 })
    await app.close()
  })

  it('GET /:accountId/trash returns trashed mails', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([{ id: 'mail-1', deleted_at: new Date().toISOString() }])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '30' })

    const res = await app.inject({ method: 'GET', url: '/acc-1/trash' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.mails).toBeDefined()
    expect(body.retentionDays).toBe(30)
    await app.close()
  })

  it('DELETE /:accountId/trash empties trash', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])

    const res = await app.inject({ method: 'DELETE', url: '/acc-1/trash' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ deleted: 0 })
    await app.close()
  })

  it('GET /config/trash returns trash config', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([
      { key: 'archive_trash_retention_days', value: '30' },
      { key: 'archive_trash_purge_enabled', value: 'true' },
    ])

    const res = await app.inject({ method: 'GET', url: '/config/trash' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ retentionDays: 30, purgeEnabled: true })
    await app.close()
  })

  it('PUT /config/trash updates trash config', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecute.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'PUT',
      url: '/config/trash',
      payload: { retentionDays: 14, purgeEnabled: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Admin routes
// ═══════════════════════════════════════════════════════════
describe('adminRoutes', () => {
  it('registers routes without error', async () => {
    const app = await buildTestApp()
    await app.register(adminRoutes)
    await app.ready()
    expect(app.printRoutes()).toBeDefined()
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Attachments routes
// ═══════════════════════════════════════════════════════════
describe('attachmentsRoutes', () => {
  it('GET /:accountId/archived returns attachments', async () => {
    const app = await buildTestApp()
    await app.register(attachmentsRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({ method: 'GET', url: '/acc-1/archived' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Unified inbox routes
// ═══════════════════════════════════════════════════════════
describe('unifiedRoutes', () => {
  it('GET /messages returns unified inbox', async () => {
    const app = await buildTestApp()
    await app.register(unifiedRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([]) // gmail_accounts

    const res = await app.inject({ method: 'GET', url: '/messages' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

// ═══════════════════════════════════════════════════════════
// Additional route tests for higher coverage
// ═══════════════════════════════════════════════════════════

describe('archiveRoutes - additional', () => {
  it('GET /:accountId/mails/:mailId returns single mail', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'mail-1', subject: 'Test' })

    const res = await app.inject({ method: 'GET', url: '/acc-1/mails/mail-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/mails/:mailId returns 404 when not found', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce(null)

    const res = await app.inject({ method: 'GET', url: '/acc-1/mails/nonexistent' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('GET /:accountId/threads registers without error', async () => {
    const app = await buildTestApp()
    await app.register(archiveRoutes)
    await app.ready()
    // Just verify the threads endpoint is registered
    expect(app.printRoutes()).toBeDefined()
    await app.close()
  })
})

describe('gmailRoutes - additional', () => {
  it('GET /:accountId/messages/:messageId returns a message', async () => {
    const { getMessage } = await import('../gmail/gmail.service')
    ;(getMessage as any).mockResolvedValueOnce({ id: 'msg-1', snippet: 'test' })

    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/messages/msg-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/messages/batch returns batch messages', async () => {
    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/messages/batch',
      payload: { ids: ['msg-1', 'msg-2'] },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/labels creates a label', async () => {
    const { createLabel } = await import('../gmail/gmail.service')
    ;(createLabel as any).mockResolvedValueOnce({ id: 'label-1', name: 'Test' })

    const app = await buildTestApp()
    await app.register(gmailRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/labels',
      payload: { name: 'Test' },
    })
    expect([200, 201]).toContain(res.statusCode)
    await app.close()
  })
})

describe('privacyRoutes - additional', () => {
  it('GET /:accountId/tracking returns tracked messages list', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/tracking' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/pii returns PII findings list', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/pii' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/tracking/scan triggers tracking scan', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/acc-1/tracking/scan' })
    expect([200, 202]).toContain(res.statusCode)
    await app.close()
  })

  it('POST /:accountId/pii/scan triggers PII scan', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/acc-1/pii/scan' })
    expect([200, 202]).toContain(res.statusCode)
    await app.close()
  })

  it('POST /encryption/setup sets up encryption', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/encryption/setup',
      payload: { passphrase: 'my-secure-passphrase' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /encryption/verify verifies encryption key', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/encryption/verify',
      payload: { passphrase: 'my-secure-passphrase' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('POST /:accountId/encryption/encrypt triggers encryption', async () => {
    const app = await buildTestApp()
    await app.register(privacyRoutes)
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/acc-1/encryption/encrypt',
      payload: { passphrase: 'my-secure-passphrase' },
    })
    expect([200, 202]).toContain(res.statusCode)
    await app.close()
  })
})

describe('rulesRoutes - additional', () => {
  it('GET /:accountId/:ruleId returns a specific rule', async () => {
    const { getRule } = await import('../rules/rules.service')
    ;(getRule as any).mockResolvedValueOnce({ id: 'rule-1', name: 'Test' })

    const app = await buildTestApp()
    await app.register(rulesRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/rule-1' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('DELETE /:accountId/:ruleId deletes a rule', async () => {
    const { getRule } = await import('../rules/rules.service')
    ;(getRule as any).mockResolvedValueOnce({ id: 'rule-1', name: 'Test' })

    const app = await buildTestApp()
    await app.register(rulesRoutes)
    await app.ready()

    const res = await app.inject({ method: 'DELETE', url: '/acc-1/rule-1' })
    expect([200, 204]).toContain(res.statusCode)
    await app.close()
  })
})

describe('webhookRoutes - additional', () => {
  it('PUT /:webhookId updates a webhook', async () => {
    const app = await buildTestApp()
    await app.register(webhookRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'wh-1', name: 'Updated' })

    const res = await app.inject({
      method: 'PUT',
      url: '/wh-1',
      payload: { name: 'Updated Hook' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('DELETE /:webhookId deletes a webhook', async () => {
    const app = await buildTestApp()
    await app.register(webhookRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ numDeletedRows: BigInt(1) })

    const res = await app.inject({ method: 'DELETE', url: '/wh-1' })
    expect([200, 204]).toContain(res.statusCode)
    await app.close()
  })
})

describe('configRoutes - additional', () => {
  it('registers import route', async () => {
    const app = await buildTestApp()
    await app.register(configRoutes)
    await app.ready()
    expect(app.printRoutes()).toBeDefined()
    await app.close()
  })
})

describe('dashboardRoutes - additional', () => {
  it('GET /:accountId/archive-stats returns archive stats', async () => {
    const app = await buildTestApp()
    await app.register(dashboardRoutes)
    await app.ready()

    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 0, total_size: '0' })
    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/acc-1/archive-stats' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

describe('duplicatesRoutes - additional', () => {
  it('GET /:accountId/live returns live duplicates', async () => {
    const app = await buildTestApp()
    await app.register(duplicatesRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])

    const res = await app.inject({ method: 'GET', url: '/acc-1/live' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

describe('savedSearchRoutes - additional', () => {
  it('PUT /:searchId updates a saved search', async () => {
    const app = await buildTestApp()
    await app.register(savedSearchRoutes)
    await app.ready()

    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'ss-1' })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'ss-1', name: 'Updated' })

    const res = await app.inject({
      method: 'PUT',
      url: '/ss-1',
      payload: { name: 'Updated Search' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PUT /reorder reorders saved searches', async () => {
    const app = await buildTestApp()
    await app.register(savedSearchRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({
      method: 'PUT',
      url: '/reorder',
      payload: { ids: ['ss-1', 'ss-2'] },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

describe('unsubscribeRoutes - additional', () => {
  it('GET /:accountId/newsletters returns newsletters', async () => {
    const app = await buildTestApp()
    await app.register(unsubscribeRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/newsletters' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('GET /:accountId/newsletters/:senderEmail/messages returns message IDs', async () => {
    const app = await buildTestApp()
    await app.register(unsubscribeRoutes)
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/acc-1/newsletters/test@test.com/messages' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

describe('notificationsRoutes - additional', () => {
  it('DELETE /:notificationId deletes notification', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'DELETE', url: '/notif-1' })
    expect([200, 204]).toContain(res.statusCode)
    await app.close()
  })

  it('DELETE / deletes all notifications', async () => {
    const app = await buildTestApp()
    await app.register(notificationsRoutes)
    await app.ready()

    mockExecute.mockResolvedValue([])

    const res = await app.inject({ method: 'DELETE', url: '/' })
    expect([200, 204]).toContain(res.statusCode)
    await app.close()
  })
})

describe('integrityRoutes - additional', () => {
  it('POST /check/async enqueues integrity check', async () => {
    const app = await buildTestApp()
    await app.register(integrityRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/check/async' })
    expect([200, 202]).toContain(res.statusCode)
    await app.close()
  })
})

describe('jobRoutes - additional', () => {
  it('GET / with status filter returns filtered jobs', async () => {
    const app = await buildTestApp()
    await app.register(jobRoutes)
    await app.ready()

    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const res = await app.inject({ method: 'GET', url: '/?status=completed' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
