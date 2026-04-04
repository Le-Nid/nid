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

// Mock kysely sql to return objects with execute
vi.mock('kysely', async () => {
  const actual = await vi.importActual('kysely')
  return {
    ...actual as any,
    sql: new Proxy(() => {}, {
      apply: () => ({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      }),
      get: (_target: any, prop: string | symbol) => {
        if (typeof prop === 'symbol') return undefined
        return (..._args: any[]) => ({
          execute: vi.fn().mockResolvedValue({ rows: [] }),
        })
      },
    }),
  }
})

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(Buffer.from('file content')),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue(mockStorage),
}))

import { getDeduplicationStats, backfillAttachmentHashes } from '../archive/dedup.service'

beforeEach(() => vi.clearAllMocks())

describe('getDeduplicationStats', () => {
  it('returns zero stats when user has no accounts', async () => {
    mockExecute.mockResolvedValueOnce([]) // no accounts
    const result = await getDeduplicationStats('user-1')
    expect(result).toEqual({
      totalAttachments: 0,
      uniqueFiles: 0,
      duplicateFiles: 0,
      totalSizeBytes: 0,
      deduplicatedSizeBytes: 0,
      savedBytes: 0,
      hashCoverage: 0,
    })
  })

  it('returns valid stats when user has accounts', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'acc-1' }]) // accounts
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 10, total_size: 50000 }) // totalRow
      .mockResolvedValueOnce({ count: 8 }) // hashedCount
      .mockResolvedValueOnce({ unique_count: 6 }) // uniqueRow

    const result = await getDeduplicationStats('user-1')
    expect(result.totalAttachments).toBe(10)
    expect(result.totalSizeBytes).toBe(50000)
    expect(result.uniqueFiles).toBe(6)
    expect(result.duplicateFiles).toBe(2) // 8 - 6
    expect(result.hashCoverage).toBe(0.8) // 8/10
  })

  it('handles null total_size', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'acc-1' }])
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 0, total_size: null })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ unique_count: 0 })

    const result = await getDeduplicationStats('user-1')
    expect(result.totalSizeBytes).toBe(0)
    expect(result.hashCoverage).toBe(0) // 0/0
  })
})

describe('backfillAttachmentHashes', () => {
  it('returns zero counts when user has no accounts', async () => {
    mockExecute.mockResolvedValueOnce([]) // no accounts
    const result = await backfillAttachmentHashes('user-1')
    expect(result).toEqual({ processed: 0, failed: 0, duplicatesRemoved: 0 })
  })

  it('processes attachments and computes hashes', async () => {
    // accounts
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1' }])
      // attachments without hash
      .mockResolvedValueOnce([
        { id: 'att-1', file_path: '/tmp/att1.pdf' },
        { id: 'att-2', file_path: '/tmp/att2.pdf' },
      ])
      // update hash for att-1
      .mockResolvedValueOnce([])
      // update hash for att-2
      .mockResolvedValueOnce([])
      // cleanupDuplicateFiles: accounts
      .mockResolvedValueOnce([{ id: 'acc-1' }])

    const result = await backfillAttachmentHashes('user-1')
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('increments failed count when file does not exist', async () => {
    mockStorage.exists.mockResolvedValueOnce(false)
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1' }])
      .mockResolvedValueOnce([{ id: 'att-1', file_path: '/tmp/missing.pdf' }])
      // cleanupDuplicateFiles: accounts
      .mockResolvedValueOnce([{ id: 'acc-1' }])

    const result = await backfillAttachmentHashes('user-1')
    expect(result.failed).toBe(1)
    expect(result.processed).toBe(0)
  })

  it('increments failed count on read error', async () => {
    mockStorage.readFile.mockRejectedValueOnce(new Error('read error'))
    mockExecute
      .mockResolvedValueOnce([{ id: 'acc-1' }])
      .mockResolvedValueOnce([{ id: 'att-1', file_path: '/tmp/bad.pdf' }])
      // cleanupDuplicateFiles: accounts
      .mockResolvedValueOnce([{ id: 'acc-1' }])

    const result = await backfillAttachmentHashes('user-1')
    expect(result.failed).toBe(1)
  })
})
