import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('../plugins/redis', () => ({ getRedis: () => mockRedis }))

import {
  getCachedStats,
  setCachedStats,
  invalidateDashboardCache,
  getCachedArchiveStats,
  setCachedArchiveStats,
  ARCHIVE_STATS_TTL,
} from '../dashboard/cache.service'

beforeEach(() => vi.clearAllMocks())

describe('getCachedStats', () => {
  it('returns null when no cache', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getCachedStats('acc-1')
    expect(result).toBeNull()
    expect(mockRedis.get).toHaveBeenCalledWith('dashboard:stats:acc-1')
  })

  it('returns parsed data when cached', async () => {
    const stats = { totalMails: 42, unread: 5 }
    mockRedis.get.mockResolvedValue(JSON.stringify(stats))
    const result = await getCachedStats('acc-1')
    expect(result).toEqual(stats)
  })
})

describe('setCachedStats', () => {
  it('sets stats with correct key and TTL', async () => {
    const stats = { totalMails: 42 }
    await setCachedStats('acc-1', stats)
    expect(mockRedis.set).toHaveBeenCalledWith(
      'dashboard:stats:acc-1',
      JSON.stringify(stats),
      'EX',
      600, // 10 minutes
    )
  })
})

describe('invalidateDashboardCache', () => {
  it('deletes the cache key', async () => {
    await invalidateDashboardCache('acc-1')
    expect(mockRedis.del).toHaveBeenCalledWith('dashboard:stats:acc-1')
  })
})

describe('getCachedArchiveStats', () => {
  it('returns null when no cache', async () => {
    mockRedis.get.mockResolvedValue(null)
    const result = await getCachedArchiveStats('acc-1')
    expect(result).toBeNull()
  })

  it('returns parsed data when cached', async () => {
    const stats = { totalArchived: 100 }
    mockRedis.get.mockResolvedValue(JSON.stringify(stats))
    const result = await getCachedArchiveStats('acc-1')
    expect(result).toEqual(stats)
  })
})

describe('setCachedArchiveStats', () => {
  it('sets archive stats with correct TTL', async () => {
    const stats = { totalArchived: 100 }
    await setCachedArchiveStats('acc-1', stats)
    expect(mockRedis.set).toHaveBeenCalledWith(
      'dashboard:archive-stats:acc-1',
      JSON.stringify(stats),
      'EX',
      ARCHIVE_STATS_TTL,
    )
  })
})

describe('ARCHIVE_STATS_TTL', () => {
  it('is 5 minutes in seconds', () => {
    expect(ARCHIVE_STATS_TTL).toBe(300)
  })
})
