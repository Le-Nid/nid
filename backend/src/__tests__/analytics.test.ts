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
  it('dismisses the user\'s suggestion and drops the cached list', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ account_id: 'acc-1' })
    expect(await dismissSuggestion('sugg-1', 'user-1')).toBe(true)
    expect(mockRedis.del).toHaveBeenCalledWith('analytics:cleanup:acc-1')
  })

  it('returns false for a suggestion of another user', async () => {
    mockRedis.del.mockClear()
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    expect(await dismissSuggestion('sugg-1', 'user-2')).toBe(false)
    expect(mockRedis.del).not.toHaveBeenCalled()
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
