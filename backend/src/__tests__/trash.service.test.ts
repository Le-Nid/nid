import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB mock ──────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockDeleteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue({ deleteFile: (...args: any[]) => mockDeleteFile(...args) }),
}))

vi.mock('../logger', () => {
  const noop = vi.fn()
  const mockLogger: any = { info: noop, warn: noop, error: noop, debug: noop, child: vi.fn(() => mockLogger) }
  return { createLogger: vi.fn(() => mockLogger) }
})

import { purgeArchiveTrash } from '../archive/trash.service'

beforeEach(() => vi.clearAllMocks())

describe('purgeArchiveTrash', () => {
  it('returns 0 when purge is disabled', async () => {
    // First call: retentionDays config
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '30' })
    // Second call: enabled config
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: 'false' })

    const result = await purgeArchiveTrash()
    expect(result).toEqual({ deleted: 0 })
  })

  it('returns 0 when no expired mails found', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '30' })
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: 'true' })
    mockExecute.mockResolvedValueOnce([]) // no expired mails

    const result = await purgeArchiveTrash()
    expect(result).toEqual({ deleted: 0 })
  })

  it('deletes expired trash mails grouped by user', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '7' }) // retention
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: 'true' }) // enabled
    // Expired mails
    mockExecute.mockResolvedValueOnce([
      { id: 'mail-1', eml_path: '/data/mail-1.eml', user_id: 'user-1' },
      { id: 'mail-2', eml_path: '/data/mail-2.eml', user_id: 'user-1' },
    ])
    // Attachments for user-1
    mockExecute.mockResolvedValueOnce([
      { id: 'att-1', file_path: '/data/att-1.pdf' },
    ])
    // deleteFrom attachments
    mockExecute.mockResolvedValueOnce(undefined)
    // deleteFrom mails
    mockExecute.mockResolvedValueOnce(undefined)

    const result = await purgeArchiveTrash()
    expect(result).toEqual({ deleted: 2 })
    // 1 attachment + 2 EMLs = 3 deleteFile calls
    expect(mockDeleteFile).toHaveBeenCalledTimes(3)
  })

  it('uses default 30 days when no retention config', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined) // no retention config
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined) // no enabled config
    mockExecute.mockResolvedValueOnce([]) // no expired mails

    const result = await purgeArchiveTrash()
    expect(result).toEqual({ deleted: 0 })
  })

  it('skips attachment deletion when none exist', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '30' })
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: 'true' })
    mockExecute.mockResolvedValueOnce([
      { id: 'mail-1', eml_path: '/data/mail-1.eml', user_id: 'user-1' },
    ])
    mockExecute.mockResolvedValueOnce([]) // no attachments
    // deleteFrom mails
    mockExecute.mockResolvedValueOnce(undefined)

    const result = await purgeArchiveTrash()
    expect(result).toEqual({ deleted: 1 })
    // Only EML file deleted
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith('/data/mail-1.eml')
  })
})
