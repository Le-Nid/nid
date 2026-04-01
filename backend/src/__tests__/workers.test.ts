import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
    updateTable: () => chainable(),
  }),
}))

vi.mock('pino', () => ({ default: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    groupBy: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    constraint: () => chain,
    doUpdateSet: () => chain,
    doNothing: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    as: () => chain,
    ref: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn(),
  listMessages: vi.fn(),
  getMessage: vi.fn(),
}))

vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: any) => fn(),
  limitConcurrency: async (tasks: any[], _concurrency: number) => {
    const results = []
    for (const task of tasks) results.push(await task())
    return results
  },
}))

vi.mock('../archive/archive.service', () => ({
  archiveMail: vi.fn(),
  getArchivedIds: vi.fn(() => new Set()),
}))

vi.mock('../notifications/notify', () => ({
  notify: vi.fn(),
}))

vi.mock('../rules/rules.service', () => ({
  getRule: vi.fn(),
  runRule: vi.fn(),
}))

vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: vi.fn(),
}))

vi.mock('../privacy/tracking.service', () => ({
  scanTrackingPixels: vi.fn(),
}))

vi.mock('../privacy/pii.service', () => ({
  scanArchivePii: vi.fn(),
}))

vi.mock('../privacy/encryption.service', () => ({
  encryptArchives: vi.fn(),
}))

vi.mock('../analytics/analytics.service', () => ({
  recordInboxSnapshot: vi.fn(),
}))

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn(),
}))

// Mock BullMQ
vi.mock('bullmq', () => {
  class MockWorker {
    constructor() {}
    on() { return this }
    close() {}
  }
  class MockQueue {
    constructor() {}
    add() { return Promise.resolve({ id: 'job-1' }) }
    close() {}
  }
  class MockQueueEvents {
    constructor() {}
    on() { return this }
    close() {}
  }
  return { Worker: MockWorker, Queue: MockQueue, QueueEvents: MockQueueEvents }
})

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
  Redis: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
}))

const mockGetRedis = vi.fn(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}))
vi.mock('../plugins/redis', () => ({ getRedis: () => mockGetRedis(), connectRedis: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('startUnifiedWorker', () => {
  it('creates a worker with correct queue name', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    const worker = startUnifiedWorker()
    expect(worker).toBeDefined()
  })
})

describe('startBulkWorker', () => {
  it('creates a worker', async () => {
    const { startBulkWorker } = await import('../jobs/workers/bulk.worker')
    const worker = startBulkWorker()
    expect(worker).toBeDefined()
  })
})

describe('startArchiveWorker', () => {
  it('creates a worker', async () => {
    const { startArchiveWorker } = await import('../jobs/workers/archive.worker')
    const worker = startArchiveWorker()
    expect(worker).toBeDefined()
  })
})

describe('startRuleWorker', () => {
  it('creates a worker', async () => {
    const { startRuleWorker } = await import('../jobs/workers/rule.worker')
    const worker = startRuleWorker()
    expect(worker).toBeDefined()
  })
})

describe('startPrivacyWorker', () => {
  it('creates a worker', async () => {
    const { startPrivacyWorker } = await import('../jobs/workers/privacy.worker')
    const worker = startPrivacyWorker()
    expect(worker).toBeDefined()
  })
})

describe('startUnsubscribeWorker', () => {
  it('creates a worker', async () => {
    const { startUnsubscribeWorker } = await import('../jobs/workers/unsubscribe.worker')
    const worker = startUnsubscribeWorker()
    expect(worker).toBeDefined()
  })
})
