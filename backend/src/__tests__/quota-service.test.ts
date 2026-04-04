import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB mock ──────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()

// Mock expression builder for select callback coverage
const mockEb = {
  fn: {
    sum: (..._args: any[]) => ({ as: () => ({}) }),
    count: (..._args: any[]) => ({ as: () => ({}) }),
    countAll: () => ({ as: () => ({}) }),
  },
}

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      return (...args: any[]) => {
        // Invoke function arguments (like select callbacks) for coverage
        for (const arg of args) {
          if (typeof arg === 'function') {
            try { arg(mockEb) } catch { /* ignore */ }
          }
        }
        return chain
      }
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

// Mock kysely sql tag to return an object with execute method
vi.mock('kysely', async () => {
  const actual = await vi.importActual('kysely')
  return {
    ...actual as any,
    sql: new Proxy(() => {}, {
      apply: () => ({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      }),
      get: (_target: any, prop: string | symbol) => {
        // Handle tagged template literal call: sql`...`
        if (typeof prop === 'symbol') return undefined
        return (..._args: any[]) => ({
          execute: vi.fn().mockResolvedValue({ rows: [] }),
        })
      },
    }),
  }
})

import { trackApiCall, getQuotaStats, cleanupOldUsageData } from '../gmail/quota.service'

beforeEach(() => vi.clearAllMocks())

describe('trackApiCall', () => {
  it('inserts usage record with known endpoint cost', async () => {
    mockExecute.mockResolvedValue([])
    await trackApiCall('acc-1', 'messages.get')
    expect(mockExecute).toHaveBeenCalled()
  })

  it('uses default cost of 5 for unknown endpoint', async () => {
    mockExecute.mockResolvedValue([])
    await trackApiCall('acc-1', 'unknown.endpoint')
    expect(mockExecute).toHaveBeenCalled()
  })
})

describe('getQuotaStats', () => {
  it('returns full quota stats structure', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ total: 100, calls: 20 }) // perMinute
      .mockResolvedValueOnce({ total: 500, calls: 100 }) // perHour
      .mockResolvedValueOnce({ total: 5000, calls: 1000 }) // perDay

    mockExecute
      .mockResolvedValueOnce([{ endpoint: 'messages.get', total_units: 250, calls: 50 }]) // topEndpoints

    const stats = await getQuotaStats('acc-1')
    expect(stats.limits.perSecond).toBe(250)
    expect(stats.limits.perMinute).toBe(15000)
    expect(stats.usage.lastMinute.units).toBe(100)
    expect(stats.usage.lastMinute.calls).toBe(20)
    expect(stats.usage.lastMinute.percentOfLimit).toBeDefined()
    expect(stats.usage.lastHour.units).toBe(500)
    expect(stats.usage.last24h.units).toBe(5000)
    expect(stats.topEndpoints).toEqual([{ endpoint: 'messages.get', units: 250, calls: 50 }])
    expect(Array.isArray(stats.hourlyBreakdown)).toBe(true)
  })

  it('handles null/zero results', async () => {
    mockExecuteTakeFirst
      .mockResolvedValue({ total: null, calls: 0 })

    mockExecute.mockResolvedValue([])

    const stats = await getQuotaStats('acc-1')
    expect(stats.usage.lastMinute.units).toBe(0)
    expect(stats.usage.lastMinute.calls).toBe(0)
    expect(stats.usage.lastMinute.percentOfLimit).toBe(0)
    expect(stats.topEndpoints).toEqual([])
  })
})

describe('cleanupOldUsageData', () => {
  it('returns count of deleted rows', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(42) })
    const result = await cleanupOldUsageData()
    expect(result).toBe(42)
  })

  it('returns 0 when no rows deleted', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(0) })
    const result = await cleanupOldUsageData()
    expect(result).toBe(0)
  })
})
