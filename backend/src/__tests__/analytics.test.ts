import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('../plugins/redis', () => ({ getRedis: () => mockRedis }))

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
    groupBy: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    columns: () => chain,
    doUpdateSet: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    as: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

const mockDb: any = {
  selectFrom: () => chainable(),
  insertInto: () => chainable(),
  updateTable: () => chainable(),
  deleteFrom: () => chainable(),
}

vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockListMessages = vi.fn()
const mockBatchGetMessages = vi.fn()
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...args: any[]) => mockListMessages(...args),
  batchGetMessages: (...args: any[]) => mockBatchGetMessages(...args),
}))

// ─── Import after mocks ─────────────────────────────────────
import {
  computeHeatmap,
  getHeatmap,
  computeSenderScores,
  getSenderScores,
  getCleanupSuggestions,
  dismissSuggestion,
  recordInboxSnapshot,
  getInboxZeroData,
} from '../analytics/analytics.service'

beforeEach(() => {
  vi.clearAllMocks()
  mockRedis.get.mockResolvedValue(null)
  mockRedis.set.mockResolvedValue('OK')
})

// ─── computeHeatmap ─────────────────────────────────────────
describe('computeHeatmap', () => {
  it('returns empty array when no messages', async () => {
    mockListMessages.mockResolvedValue({ messages: [] })
    const result = await computeHeatmap('acc-1')
    expect(result).toEqual([])
  })

  it('computes heatmap cells from messages', async () => {
    // Wednesday Jan 15 2025 10:30
    const wed = new Date(2025, 0, 15, 10, 30)
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }, { id: 'm2' }] })
    mockBatchGetMessages.mockResolvedValue([
      { date: wed.toISOString() },
      { date: wed.toISOString() },
    ])
    mockExecute.mockResolvedValue([])

    const result = await computeHeatmap('acc-1')
    expect(result.length).toBeGreaterThan(0)
    // Wednesday => jsDay=3 => day=2
    expect(result[0].day).toBe(2)
    expect(result[0].hour).toBe(10)
    expect(result[0].count).toBe(2)
  })

  it('handles Sunday correctly (day=6)', async () => {
    const sun = new Date(2025, 0, 19, 14, 0) // Sunday
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }] })
    mockBatchGetMessages.mockResolvedValue([{ date: sun.toISOString() }])
    mockExecute.mockResolvedValue([])

    const result = await computeHeatmap('acc-1')
    expect(result[0].day).toBe(6)
  })

  it('skips invalid dates', async () => {
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }] })
    mockBatchGetMessages.mockResolvedValue([{ date: 'invalid-date' }])
    mockExecute.mockResolvedValue([])

    const result = await computeHeatmap('acc-1')
    expect(result).toEqual([])
  })
})

// ─── getHeatmap ─────────────────────────────────────────────
describe('getHeatmap', () => {
  it('returns cached data when available', async () => {
    const cached = [{ day: 0, hour: 10, count: 5 }]
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))

    const result = await getHeatmap('acc-1')
    expect(result).toEqual(cached)
    expect(mockListMessages).not.toHaveBeenCalled()
  })

  it('queries DB when no cache and data exists', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockExecute.mockResolvedValue([
      { day_of_week: 1, hour_of_day: 14, email_count: 10 },
    ])

    const result = await getHeatmap('acc-1')
    expect(result).toEqual([{ day: 1, hour: 14, count: 10 }])
    expect(mockRedis.set).toHaveBeenCalled()
  })

  it('forces recompute when refresh=true', async () => {
    mockListMessages.mockResolvedValue({ messages: [] })
    mockExecute.mockResolvedValue([])
    mockExecuteTakeFirst.mockResolvedValue(null)

    const result = await getHeatmap('acc-1', true)
    expect(result).toEqual([])
    expect(mockListMessages).toHaveBeenCalled()
  })
})

// ─── computeSenderScores ───────────────────────────────────
describe('computeSenderScores', () => {
  it('returns empty for no messages', async () => {
    mockListMessages.mockResolvedValue({ messages: [] })
    const result = await computeSenderScores('acc-1')
    expect(result).toEqual([])
  })

  it('calculates clutter score correctly', async () => {
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }] })
    mockBatchGetMessages.mockResolvedValue([
      { from: 'spam@test.com', sizeEstimate: 1000, labelIds: ['UNREAD'] },
    ])
    mockExecute.mockResolvedValue([]) // unsubSenders

    const result = await computeSenderScores('acc-1')
    expect(result.length).toBe(1)
    expect(result[0].sender).toBe('spam@test.com')
    expect(result[0].emailCount).toBe(1)
    expect(result[0].unreadCount).toBe(1)
    expect(result[0].clutterScore).toBeGreaterThanOrEqual(0)
    expect(result[0].clutterScore).toBeLessThanOrEqual(100)
  })

  it('sorts by clutter score descending', async () => {
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }, { id: 'm2' }] })
    mockBatchGetMessages.mockResolvedValue([
      { from: 'low@test.com', sizeEstimate: 100, labelIds: [] },
      { from: 'high@test.com', sizeEstimate: 50_000_000, labelIds: ['UNREAD'] },
    ])
    mockExecute.mockResolvedValue([])

    const result = await computeSenderScores('acc-1')
    expect(result[0].clutterScore).toBeGreaterThanOrEqual(result[1].clutterScore)
  })
})

// ─── getSenderScores ────────────────────────────────────────
describe('getSenderScores', () => {
  it('returns cached data', async () => {
    const cached = [{ sender: 'a@b.com', clutterScore: 50 }]
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))
    const result = await getSenderScores('acc-1')
    expect(result).toEqual(cached)
  })

  it('returns DB data when no cache', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockExecute.mockResolvedValue([{
      sender: 'a@b.com', email_count: 5, total_size_bytes: 1024,
      unread_count: 2, has_unsubscribe: false, read_rate: 0.6, clutter_score: 30,
    }])

    const result = await getSenderScores('acc-1')
    expect(result[0].sender).toBe('a@b.com')
    expect(result[0].emailCount).toBe(5)
  })
})

// ─── dismissSuggestion ─────────────────────────────────────
describe('dismissSuggestion', () => {
  it('updates suggestion as dismissed', async () => {
    mockExecute.mockResolvedValue([])
    await dismissSuggestion('sugg-1')
    expect(mockExecute).toHaveBeenCalled()
  })
})

// ─── recordInboxSnapshot ────────────────────────────────────
describe('recordInboxSnapshot', () => {
  it('records inbox and unread counts', async () => {
    mockListMessages.mockImplementation((_id: string, opts: any) => {
      if (opts?.query?.includes('is:unread')) {
        return { resultSizeEstimate: 5 }
      }
      return { resultSizeEstimate: 42 }
    })
    mockExecute.mockResolvedValue([])

    const result = await recordInboxSnapshot('acc-1')
    expect(result).toEqual({ inboxCount: 42, unreadCount: 5 })
  })
})

// ─── getInboxZeroData ───────────────────────────────────────
describe('getInboxZeroData', () => {
  it('returns cached data when available', async () => {
    const cached = { current: { inboxCount: 0, unreadCount: 0 }, history: [], streak: 1, bestStreak: 3 }
    mockRedis.get.mockResolvedValue(JSON.stringify(cached))

    const result = await getInboxZeroData('acc-1')
    expect(result).toEqual(cached)
  })

  it('computes streak from history', async () => {
    mockRedis.get.mockResolvedValue(null)
    // Existing latest snapshot
    mockExecuteTakeFirst.mockResolvedValue({ inbox_count: 0, unread_count: 0, recorded_at: new Date() })
    // History: 3 consecutive inbox-zero days
    mockExecute.mockResolvedValue([
      { date: '2025-01-15', inbox_count: 0, unread_count: 0 },
      { date: '2025-01-14', inbox_count: 0, unread_count: 0 },
      { date: '2025-01-13', inbox_count: 5, unread_count: 2 },
    ])

    const result = await getInboxZeroData('acc-1')
    expect(result.current).toEqual({ inboxCount: 0, unreadCount: 0 })
    expect(result.history).toHaveLength(3)
  })
})
