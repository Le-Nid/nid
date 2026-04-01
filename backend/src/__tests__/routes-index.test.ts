import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'

// ─── Build a Fastify app with mocked decorators ────────────
let app: FastifyInstance

const mockDb: any = new Proxy({}, {
  get: () => {
    const chainable: any = () => new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'execute') return vi.fn().mockResolvedValue([])
        if (prop === 'executeTakeFirst') return vi.fn().mockResolvedValue(null)
        if (prop === 'executeTakeFirstOrThrow') return vi.fn().mockResolvedValue({})
        return (..._args: any[]) => chainable()
      },
    })
    return (..._args: any[]) => chainable()
  },
})

const mockRedis: any = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
}

function buildApp() {
  const fastify = Fastify({ logger: false })

  // Decorate with mocks
  fastify.decorate('db', mockDb)
  fastify.decorate('redis', mockRedis)
  fastify.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1', email: 'test@test.com', role: 'user' }
  })
  fastify.decorate('requireAccountOwnership', async () => {})
  fastify.decorate('requireAdmin', async (request: any, reply: any) => {
    if (request.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' })
    }
  })

  return fastify
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Test routes/index.ts — registerRoutes ─────────────────
describe('registerRoutes', () => {
  it('registers health check and all API routes', async () => {
    // We mock all service modules to avoid real DB/API calls
    vi.mock('../analytics/analytics.service', () => ({
      getHeatmap: vi.fn().mockResolvedValue([]),
      getSenderScores: vi.fn().mockResolvedValue([]),
      getCleanupSuggestions: vi.fn().mockResolvedValue([]),
      dismissSuggestion: vi.fn(),
      getInboxZeroData: vi.fn().mockResolvedValue({ current: { inboxCount: 0, unreadCount: 0 }, history: [], streak: 0, bestStreak: 0 }),
      recordInboxSnapshot: vi.fn().mockResolvedValue({ inboxCount: 0, unreadCount: 0 }),
    }))
    vi.mock('../archive/archive.service', () => ({
      archiveMail: vi.fn(),
      getArchivedIds: vi.fn(() => new Set()),
    }))
    vi.mock('../archive/export.service', () => ({
      streamArchiveZip: vi.fn(),
    }))
    vi.mock('../archive/integrity.service', () => ({
      checkArchiveIntegrity: vi.fn().mockResolvedValue({
        totalRecords: 0, checkedFiles: 0, missingFiles: [], orphanedFiles: [], corruptedFiles: [], healthy: true,
      }),
    }))
    vi.mock('../audit/audit.service', () => ({
      logAudit: vi.fn(),
    }))
    vi.mock('../auth/oauth.service', () => ({
      createOAuth2Client: vi.fn(),
      getGmailAuthUrl: vi.fn(() => 'https://auth.url'),
      exchangeGmailCode: vi.fn(),
      getAuthenticatedClient: vi.fn(),
    }))
    vi.mock('../auth/social.service', () => ({
      getEnabledProviders: vi.fn(() => []),
      isProviderEnabled: vi.fn(() => false),
      createAuthorizationUrl: vi.fn(),
      exchangeSocialCode: vi.fn(),
    }))
    vi.mock('../dashboard/cache.service', () => ({
      getCachedStats: vi.fn().mockResolvedValue(null),
      setCachedStats: vi.fn(),
      invalidateDashboardCache: vi.fn(),
      getCachedArchiveStats: vi.fn().mockResolvedValue(null),
      setCachedArchiveStats: vi.fn(),
    }))
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
      getMailboxProfile: vi.fn(),
      getGmailClient: vi.fn(),
    }))
    vi.mock('../jobs/queue', () => ({
      enqueueJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
      getQueue: vi.fn(),
    }))
    vi.mock('../notifications/notification-prefs.service', () => ({
      shouldNotify: vi.fn().mockResolvedValue(true),
      NOTIFICATION_DEFAULTS: {},
    }))
    vi.mock('../notifications/notify', () => ({
      notify: vi.fn(),
    }))
    vi.mock('../privacy/encryption.service', () => ({
      setupEncryption: vi.fn(),
      verifyEncryptionKey: vi.fn().mockResolvedValue(true),
      encryptArchives: vi.fn(),
      getEncryptionStatus: vi.fn().mockResolvedValue({ total: 0, encrypted: 0, unencrypted: 0, percentage: 0 }),
      decryptFile: vi.fn(),
    }))
    vi.mock('../privacy/pii.service', () => ({
      detectPii: vi.fn(() => []),
      scanArchivePii: vi.fn(),
      getPiiStats: vi.fn().mockResolvedValue({ totalFindings: 0, affectedMails: 0, byType: [] }),
      listPiiFindings: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    }))
    vi.mock('../privacy/tracking.service', () => ({
      detectTrackingPixels: vi.fn(() => []),
      scanTrackingPixels: vi.fn(),
      getTrackingStats: vi.fn().mockResolvedValue({ trackedMessages: 0, totalTrackers: 0, topDomains: [] }),
      listTrackedMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    }))
    vi.mock('../reports/report.service', () => ({
      generateWeeklyReport: vi.fn().mockResolvedValue(null),
      generateAllReports: vi.fn().mockResolvedValue([]),
    }))
    vi.mock('../rules/rules.service', () => ({
      getRules: vi.fn().mockResolvedValue([]),
      getRule: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      buildGmailQuery: vi.fn(() => ''),
      runRule: vi.fn(),
    }))
    vi.mock('../rules/rule-templates', () => ({
      RULE_TEMPLATES: [],
    }))
    vi.mock('../unsubscribe/unsubscribe.service', () => ({
      scanNewsletters: vi.fn().mockResolvedValue([]),
      getNewsletterMessageIds: vi.fn().mockResolvedValue([]),
    }))
    vi.mock('../webhooks/webhook.service', () => ({
      triggerWebhooks: vi.fn(),
    }))
    vi.mock('../plugins/redis', () => ({
      getRedis: () => mockRedis,
      connectRedis: vi.fn(),
    }))
    vi.mock('../db', () => ({
      getDb: () => mockDb,
      db: mockDb,
      runMigrations: vi.fn(),
      closeDb: vi.fn(),
    }))
    vi.mock('bullmq', () => {
      class MockQueueEvents {
        on() { return this }
        close() {}
      }
      return { QueueEvents: MockQueueEvents }
    })

    const { registerRoutes } = await import('../routes/index')
    app = buildApp()
    await registerRoutes(app)
    await app.ready()

    // Health check
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
  })
})
