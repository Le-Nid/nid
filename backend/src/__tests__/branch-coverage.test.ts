import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB mock ──────────────────────────────────────────────
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

vi.mock('kysely', async () => {
  const actual = await vi.importActual('kysely')
  return {
    ...actual as any,
    sql: new Proxy((..._args: any[]) => ({ as: () => ({}) }), {
      apply: (_target: any, _thisArg: any, args: any[]) => {
        // tagged template literal call
        return { as: () => ({}), execute: vi.fn().mockResolvedValue({ rows: [] }) }
      },
      get: (_target: any, prop: string | symbol) => {
        if (typeof prop === 'symbol') return undefined
        return (..._args: any[]) => ({ execute: vi.fn().mockResolvedValue({ rows: [] }) })
      },
    }),
  }
})

const mockRedisGet = vi.fn().mockResolvedValue(null)
const mockRedisSet = vi.fn()
vi.mock('../plugins/redis', () => ({
  getRedis: () => ({
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
    del: vi.fn(),
    setex: vi.fn(),
  }),
}))

const mockListMessages = vi.fn()
const mockBatchGetMessages = vi.fn()
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...args: any[]) => mockListMessages(...args),
  batchGetMessages: (...args: any[]) => mockBatchGetMessages(...args),
}))

const mockEnqueueJob = vi.fn()
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
}))

vi.mock('../notifications/notify', () => ({ notify: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

// ═══════════════════════════════════════════════════════════
// REPORT SERVICE — branch coverage for report.service.ts
// ═══════════════════════════════════════════════════════════
import { generateWeeklyReport, generateAllReports } from '../reports/report.service'

describe('report.service - branch coverage', () => {
  it('returns report with null archive counts (coalesce branches)', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'user-1', email: 'a@b.com' }) // user
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ total: 5, completed: 3, failed: 2 })  // jobStats
      .mockResolvedValueOnce({ count: null, total_size: null })       // archiveStats (null!)
      .mockResolvedValueOnce({ count: null })                         // rulesExecuted (null!)
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1' }]) // accounts
      .mockResolvedValueOnce([])                  // topSenders

    const result = await generateWeeklyReport('user-1')
    expect(result!.stats.mailsArchived).toBe(0)
    expect(result!.stats.archiveSizeBytes).toBe(0)
    expect(result!.stats.rulesExecuted).toBe(0)
  })

  it('generateAllReports filters out null reports', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]) // users
    // u1: user not found → null report
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    // u2: valid user
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'u2', email: 'b@c.com' })
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ total: 0, completed: 0, failed: 0 })
      .mockResolvedValueOnce({ count: 0 })
    mockExecute
      .mockResolvedValueOnce([]) // u2 accounts

    const reports = await generateAllReports()
    expect(reports).toHaveLength(1)
    expect(reports[0].userId).toBe('u2')
  })
})

// ═══════════════════════════════════════════════════════════
// QUOTA SERVICE — branch coverage
// ═══════════════════════════════════════════════════════════
import { getQuotaStats, cleanupOldUsageData } from '../gmail/quota.service'

describe('quota.service - branch coverage', () => {
  it('handles undefined results (all ?? 0)', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce(undefined) // perMinute
      .mockResolvedValueOnce(undefined) // perHour
      .mockResolvedValueOnce(undefined) // perDay
    mockExecute.mockResolvedValueOnce([]) // topEndpoints

    const stats = await getQuotaStats('acc-1')
    expect(stats.usage.lastMinute.units).toBe(0)
    expect(stats.usage.lastMinute.calls).toBe(0)
    expect(stats.usage.lastHour.units).toBe(0)
    expect(stats.usage.last24h.units).toBe(0)
  })

  it('cleanupOldUsageData handles undefined numDeletedRows', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ numDeletedRows: undefined })
    const result = await cleanupOldUsageData()
    expect(result).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════
// ANALYTICS SERVICE — deeper branch coverage
// ═══════════════════════════════════════════════════════════
import {
  computeCleanupSuggestions,
  getCleanupSuggestions,
  getInboxZeroData,
  getSenderScores,
} from '../analytics/analytics.service'

describe('analytics.service - branch coverage', () => {
  it('computeCleanupSuggestions — large_sender and old_newsletters branches', async () => {
    // getSenderScores will use cache
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([
      {
        sender: 'big@co.com', emailCount: 200, totalSizeBytes: 20 * 1024 * 1024,
        unreadCount: 5, hasUnsubscribe: false, readRate: 0.8, clutterScore: 60,
      },
      {
        sender: 'news@nl.com', emailCount: 10, totalSizeBytes: 5000,
        unreadCount: 0, hasUnsubscribe: true, readRate: 0.1, clutterScore: 30,
      },
    ]))
    mockExecute.mockResolvedValue([]) // delete old suggestions
    mockExecuteTakeFirstOrThrow.mockResolvedValue({
      id: 'sug-1', type: 'large_sender', title: 'T', description: 'D',
      sender: 'big@co.com', email_count: 200, total_size_bytes: BigInt(20 * 1024 * 1024),
      query: 'q', is_dismissed: false,
    })

    const result = await computeCleanupSuggestions('acc-1')
    // Should have large_sender and old_newsletters suggestions
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('getCleanupSuggestions returns DB suggestions without recomputing', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecute.mockResolvedValueOnce([
      { id: 's1', type: 'bulk_unread', title: 'T', description: 'D', sender: 's', email_count: 5, total_size_bytes: BigInt(100), query: 'q', is_dismissed: false },
    ])

    const result = await getCleanupSuggestions('acc-1')
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('s1')
  })

  it('getInboxZeroData with existing latest (no refresh)', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecuteTakeFirst.mockResolvedValueOnce({
      inbox_count: 3, unread_count: 1, recorded_at: new Date(),
    })
    mockExecute.mockResolvedValueOnce([]) // history

    const result = await getInboxZeroData('acc-1')
    expect(result.current.inboxCount).toBe(3)
  })

  it('getSenderScores from DB (no refresh)', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecute.mockResolvedValueOnce([
      { sender: 'a@b.com', email_count: 10, total_size_bytes: 5000, unread_count: 2, has_unsubscribe: true, read_rate: 0.5, clutter_score: 40 },
    ])

    const result = await getSenderScores('acc-1')
    expect(result.length).toBe(1)
    expect(result[0].sender).toBe('a@b.com')
  })
})

// ═══════════════════════════════════════════════════════════
// RULES SERVICE — remaining branches
// ═══════════════════════════════════════════════════════════
import { buildGmailQuery, runRule } from '../rules/rules.service'

describe('rules.service - additional branch coverage', () => {
  it('buildGmailQuery with to not_equals', () => {
    expect(buildGmailQuery([{ field: 'to', operator: 'not_equals', value: 'x@y.com' }]))
      .toBe('-to:(x@y.com)')
  })

  it('buildGmailQuery with subject not_equals', () => {
    expect(buildGmailQuery([{ field: 'subject', operator: 'not_equals', value: 'spam' }]))
      .toBe('-subject:(spam)')
  })

  it('buildGmailQuery with to equals', () => {
    expect(buildGmailQuery([{ field: 'to', operator: 'equals', value: 'me@t.com' }]))
      .toBe('to:(me@t.com)')
  })

  it('runRule with pagination (multi-page results)', async () => {
    mockListMessages
      .mockResolvedValueOnce({ messages: [{ id: 'm1' }], nextPageToken: 'token2' })
      .mockResolvedValueOnce({ messages: [{ id: 'm2' }], nextPageToken: null })
    mockEnqueueJob.mockResolvedValueOnce({ id: 'job-1' })
    mockExecute.mockResolvedValue([])

    const result = await runRule(
      { id: 'r1', conditions: [{ field: 'from', operator: 'contains', value: 'x' }], action: { type: 'trash' } },
      'acc-1',
    )
    expect(result.matched).toBe(2)
    expect(mockListMessages).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════
// RULES SERVICE — updateRule field branches
// ═══════════════════════════════════════════════════════════
import { updateRule } from '../rules/rules.service'

describe('rules.service updateRule branches', () => {
  it('updates all fields at once', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'r1', name: 'X' })
    await updateRule('r1', 'acc-1', {
      name: 'New',
      description: 'Desc',
      conditions: [{ field: 'from', operator: 'contains', value: 'x' }],
      action: { type: 'trash' },
      schedule: '0 * * * *',
      is_active: false,
    })
    expect(mockExecuteTakeFirstOrThrow).toHaveBeenCalled()
  })

  it('updates only name (other fields undefined)', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'r1', name: 'Updated' })
    await updateRule('r1', 'acc-1', { name: 'Updated' })
    expect(mockExecuteTakeFirstOrThrow).toHaveBeenCalled()
  })

  it('updates with null description and schedule', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'r1', name: 'R' })
    await updateRule('r1', 'acc-1', { description: undefined, schedule: undefined })
    expect(mockExecuteTakeFirstOrThrow).toHaveBeenCalled()
  })
})
