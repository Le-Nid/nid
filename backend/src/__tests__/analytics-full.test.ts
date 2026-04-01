import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
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

const mockRedisGet = vi.fn().mockResolvedValue(null)
const mockRedisSet = vi.fn()
vi.mock('../plugins/redis', () => ({
  getRedis: () => ({
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
  }),
}))

const mockListMessages = vi.fn()
const mockBatchGetMessages = vi.fn()
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...args: any[]) => mockListMessages(...args),
  batchGetMessages: (...args: any[]) => mockBatchGetMessages(...args),
}))

beforeEach(() => vi.clearAllMocks())

import {
  computeHeatmap,
  getHeatmap,
  computeSenderScores,
  getSenderScores,
  computeCleanupSuggestions,
  getCleanupSuggestions,
  dismissSuggestion,
  recordInboxSnapshot,
  getInboxZeroData,
} from '../analytics/analytics.service'

describe('computeHeatmap', () => {
  it('returns empty array when no messages', async () => {
    mockListMessages.mockResolvedValueOnce({ messages: [] })
    const result = await computeHeatmap('acc-1')
    expect(result).toEqual([])
  })

  it('computes heatmap from messages', async () => {
    mockListMessages.mockResolvedValueOnce({
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
    })
    mockBatchGetMessages.mockResolvedValueOnce([
      { id: 'msg-1', date: '2024-06-17T10:30:00Z' }, // Monday, hour 10 UTC
      { id: 'msg-2', date: '2024-06-17T10:45:00Z' }, // Monday, hour 10 UTC
    ])
    mockExecute.mockResolvedValue([])

    const result = await computeHeatmap('acc-1')
    expect(result.length).toBeGreaterThan(0)
    // Both messages are on the same day+hour
    expect(result[0].count).toBe(2)
  })

  it('skips invalid dates', async () => {
    mockListMessages.mockResolvedValueOnce({ messages: [{ id: 'msg-1' }] })
    mockBatchGetMessages.mockResolvedValueOnce([
      { id: 'msg-1', date: 'invalid' },
    ])
    mockExecute.mockResolvedValue([])

    const result = await computeHeatmap('acc-1')
    expect(result).toEqual([])
  })
})

describe('getHeatmap', () => {
  it('returns cached data if no refresh', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([{ day: 0, hour: 10, count: 5 }]))
    const result = await getHeatmap('acc-1')
    expect(result).toEqual([{ day: 0, hour: 10, count: 5 }])
  })

  it('returns DB data if exists and no refresh', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecute.mockResolvedValueOnce([
      { day_of_week: 0, hour_of_day: 10, email_count: 5 },
    ])

    const result = await getHeatmap('acc-1')
    expect(result.length).toBe(1)
    expect(result[0].day).toBe(0)
  })

  it('recomputes when refresh=true', async () => {
    mockListMessages.mockResolvedValueOnce({ messages: [] })
    mockExecute.mockResolvedValue([])

    const result = await getHeatmap('acc-1', true)
    expect(result).toEqual([])
  })

  it('recomputes when DB has no rows', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    mockExecute.mockResolvedValueOnce([]) // no DB rows
    mockListMessages.mockResolvedValueOnce({ messages: [] })

    const result = await getHeatmap('acc-1')
    expect(result).toEqual([])
  })
})

describe('computeSenderScores', () => {
  it('returns empty when no messages', async () => {
    mockListMessages.mockResolvedValueOnce({ messages: [] })
    const result = await computeSenderScores('acc-1')
    expect(result).toEqual([])
  })

  it('computes scores from messages', async () => {
    mockListMessages.mockResolvedValueOnce({
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
    })
    mockBatchGetMessages.mockResolvedValueOnce([
      { id: 'msg-1', from: 'sender@test.com', sizeEstimate: 5000, labelIds: ['INBOX', 'UNREAD'] },
      { id: 'msg-2', from: 'sender@test.com', sizeEstimate: 3000, labelIds: ['INBOX'] },
    ])
    mockExecute.mockResolvedValue([]) // unsub senders, upsert

    const result = await computeSenderScores('acc-1')
    expect(result.length).toBe(1)
    expect(result[0].sender).toBe('sender@test.com')
    expect(result[0].emailCount).toBe(2)
    expect(result[0].unreadCount).toBe(1)
  })
})

describe('getSenderScores', () => {
  it('returns cached data', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([{ sender: 'test', clutterScore: 50 }]))
    const result = await getSenderScores('acc-1')
    expect(result.length).toBe(1)
  })

  it('returns DB data if available', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    mockExecute.mockResolvedValueOnce([
      { sender: 'test', email_count: 5, total_size_bytes: 1000, unread_count: 2, has_unsubscribe: false, read_rate: 0.6, clutter_score: 30 },
    ])
    const result = await getSenderScores('acc-1')
    expect(result.length).toBe(1)
  })
})

describe('computeCleanupSuggestions', () => {
  it('generates bulk_unread suggestion', async () => {
    // getSenderScores will be called internally, need the whole chain
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([
      { sender: 'spammer@test.com', emailCount: 100, totalSizeBytes: 50000, unreadCount: 25, hasUnsubscribe: false, readRate: 0.6, clutterScore: 40 },
    ]))
    mockExecute.mockResolvedValue([]) // delete old suggestions
    mockExecuteTakeFirstOrThrow.mockResolvedValue({
      id: 'sug-1', type: 'bulk_unread', title: 'test', description: 'desc',
      sender: 'spammer@test.com', email_count: 25, total_size_bytes: BigInt(50000),
      query: 'from:spammer is:unread', is_dismissed: false,
    })

    const result = await computeCleanupSuggestions('acc-1')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getCleanupSuggestions', () => {
  it('returns cached suggestions', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([{ id: 'sug-1', type: 'bulk_unread' }]))
    const result = await getCleanupSuggestions('acc-1')
    expect(result.length).toBe(1)
  })

  it('returns existing DB suggestions', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecute.mockResolvedValueOnce([
      { id: 'sug-1', type: 'bulk_unread', title: 'T', description: 'D', sender: 's@t.com', email_count: 10, total_size_bytes: BigInt(1000), query: 'q', is_dismissed: false },
    ])
    const result = await getCleanupSuggestions('acc-1')
    expect(result.length).toBe(1)
  })
})

describe('dismissSuggestion', () => {
  it('marks suggestion as dismissed', async () => {
    mockExecute.mockResolvedValueOnce([])
    await dismissSuggestion('sug-1')
    expect(mockExecute).toHaveBeenCalled()
  })
})

describe('recordInboxSnapshot', () => {
  it('records inbox and unread counts', async () => {
    mockListMessages
      .mockResolvedValueOnce({ resultSizeEstimate: 50 }) // inbox
      .mockResolvedValueOnce({ resultSizeEstimate: 10 }) // unread
    mockExecute.mockResolvedValueOnce([])

    const result = await recordInboxSnapshot('acc-1')
    expect(result.inboxCount).toBe(50)
    expect(result.unreadCount).toBe(10)
  })
})

describe('getInboxZeroData', () => {
  it('returns cached data', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify({
      current: { inboxCount: 0, unreadCount: 0 },
      history: [],
      streak: 1,
      bestStreak: 3,
    }))
    const result = await getInboxZeroData('acc-1')
    expect(result.streak).toBe(1)
  })

  it('uses latest snapshot from DB when available', async () => {
    mockRedisGet.mockResolvedValueOnce(null) // no cache
    mockExecuteTakeFirst.mockResolvedValueOnce({
      inbox_count: 5,
      unread_count: 2,
      recorded_at: new Date(),
    })
    mockExecute.mockResolvedValueOnce([]) // history

    const result = await getInboxZeroData('acc-1')
    expect(result.current.inboxCount).toBe(5)
  })

  it('creates new snapshot when no latest exists', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    mockExecuteTakeFirst.mockResolvedValueOnce(null) // no latest
    mockListMessages
      .mockResolvedValueOnce({ resultSizeEstimate: 3 })
      .mockResolvedValueOnce({ resultSizeEstimate: 1 })
    mockExecute.mockResolvedValue([]) // insert + history

    const result = await getInboxZeroData('acc-1')
    expect(result.current.inboxCount).toBe(3)
  })

  it('computes correct streaks', async () => {
    mockRedisGet.mockResolvedValueOnce(null)
    mockExecuteTakeFirst.mockResolvedValueOnce({
      inbox_count: 0, unread_count: 0, recorded_at: new Date(),
    })
    mockExecute.mockResolvedValueOnce([
      { date: '2024-06-18', inbox_count: 0, unread_count: 0 },
      { date: '2024-06-17', inbox_count: 0, unread_count: 0 },
      { date: '2024-06-16', inbox_count: 5, unread_count: 2 },
    ])

    const result = await getInboxZeroData('acc-1')
    // Sorted DESC: 2024-06-18 (0), 2024-06-17 (0), 2024-06-16 (5)
    // Streak from latest: 2 consecutive inbox_count=0
    expect(result.streak).toBe(2)
    expect(result.bestStreak).toBe(2)
  })
})
