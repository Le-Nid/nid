import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
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
    returning: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
  }),
}))

vi.mock('kysely', () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    as: () => ({}),
  }),
}))

import { generateWeeklyReport, generateAllReports } from '../reports/report.service'

beforeEach(() => vi.clearAllMocks())

describe('generateWeeklyReport', () => {
  it('returns null for inactive/missing user', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    const result = await generateWeeklyReport('user-1')
    expect(result).toBeNull()
  })

  it('generates report for an active user', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ id: 'user-1', email: 'test@test.com' })
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ total: 10, completed: 8, failed: 2 }) // jobStats
      .mockResolvedValueOnce({ count: 50, total_size: 1024000 })     // archiveStats
      .mockResolvedValueOnce({ count: 3 })                          // rulesExecuted
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1' }]) // accounts
      .mockResolvedValueOnce([{ sender: 'a@b.com', count: 5 }]) // topSenders

    const result = await generateWeeklyReport('user-1')
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user-1')
    expect(result!.email).toBe('test@test.com')
    expect(result!.stats.jobsCompleted).toBe(8)
    expect(result!.stats.jobsFailed).toBe(2)
    expect(result!.stats.rulesExecuted).toBe(3)
  })

  it('handles user with no gmail accounts', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ id: 'user-1', email: 'test@test.com' })
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ total: 0, completed: 0, failed: 0 })
      .mockResolvedValueOnce({ count: 0 })
    mockExecute
      .mockResolvedValueOnce([]) // no accounts

    const result = await generateWeeklyReport('user-1')
    expect(result!.stats.mailsArchived).toBe(0)
    expect(result!.stats.archiveSizeBytes).toBe(0)
    expect(result!.stats.topSenders).toEqual([])
  })
})

describe('generateAllReports', () => {
  it('generates reports for all active users', async () => {
    // First call = users list, then per-user calls
    mockExecute
      .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]) // users
      .mockResolvedValueOnce([]) // u1 accounts
      .mockResolvedValueOnce([]) // u2 accounts

    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com' }) // u1 user
      .mockResolvedValueOnce({ id: 'u2', email: 'c@d.com' }) // u2 user

    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ total: 0, completed: 0, failed: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ total: 0, completed: 0, failed: 0 })
      .mockResolvedValueOnce({ count: 0 })

    const reports = await generateAllReports()
    expect(reports).toHaveLength(2)
  })
})
