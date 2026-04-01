import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    ARCHIVE_PATH: '/tmp/archives',
  },
}))

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()
const mockReturningAll = vi.fn(() => ({
  executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  execute: mockExecute,
}))

const mockChain = {
  selectAll: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  values: vi.fn(() => ({ returningAll: mockReturningAll })),
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      execute: mockExecute,
    })),
  })),
  execute: mockExecute,
  executeTakeFirst: mockExecuteTakeFirst,
  executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
}

vi.mock('../db', () => ({
  getDb: vi.fn(() => ({
    selectFrom: vi.fn(() => mockChain),
    insertInto: vi.fn(() => mockChain),
    updateTable: vi.fn(() => mockChain),
    deleteFrom: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({ executeTakeFirst: vi.fn(() => ({ numDeletedRows: 1n })) })),
        executeTakeFirst: vi.fn(() => ({ numDeletedRows: 0n })),
      })),
    })),
  })),
}))

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() },
  readFile: vi.fn(),
}))

vi.mock('mailparser', () => ({
  simpleParser: vi.fn(),
}))

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))

import { createShareLink, getSharedMail, revokeShare, cleanupExpiredShares } from '../archive/sharing.service'

describe('Sharing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createShareLink', () => {
    it('creates a share with a token', async () => {
      mockExecuteTakeFirst.mockResolvedValue({
        id: 'mail-1',
        subject: 'Test',
        sender: 'alice@test.com',
        date: new Date(),
        eml_path: '/tmp/test.eml',
      })

      const shareResult = {
        id: 'share-1',
        archived_mail_id: 'mail-1',
        token: 'abc123',
        expires_at: new Date(Date.now() + 86400000),
        access_count: 0,
      }
      mockExecuteTakeFirstOrThrow.mockResolvedValue(shareResult)

      const result = await createShareLink('user-1', {
        archivedMailId: 'mail-1',
        expiresInHours: 24,
      })

      expect(result.id).toBe('share-1')
      expect(result.subject).toBe('Test')
    })

    it('throws when mail not found', async () => {
      mockExecuteTakeFirst.mockResolvedValue(undefined)

      await expect(
        createShareLink('user-1', { archivedMailId: 'nonexistent' })
      ).rejects.toThrow('Archived mail not found or access denied')
    })
  })

  describe('getSharedMail', () => {
    it('returns null for invalid token', async () => {
      mockExecuteTakeFirst.mockResolvedValue(undefined)
      const result = await getSharedMail('invalidtoken')
      expect(result).toBeNull()
    })

    it('returns null for expired share', async () => {
      mockExecuteTakeFirst.mockResolvedValue({
        share_id: 'share-1',
        token: 'abc',
        expires_at: new Date(Date.now() - 86400000), // expired
        access_count: 0,
        max_access: null,
        mail_id: 'mail-1',
        subject: 'Test',
        sender: 'alice@test.com',
        recipient: 'bob@test.com',
        date: new Date(),
        snippet: 'Test snippet',
        eml_path: '/tmp/test.eml',
        is_encrypted: false,
      })

      const result = await getSharedMail('abc')
      expect(result).toBeNull()
    })

    it('returns null when access limit reached', async () => {
      mockExecuteTakeFirst.mockResolvedValue({
        share_id: 'share-1',
        token: 'abc',
        expires_at: new Date(Date.now() + 86400000),
        access_count: 5,
        max_access: 5, // limit reached
        mail_id: 'mail-1',
        subject: 'Test',
        sender: 'alice@test.com',
        recipient: 'bob@test.com',
        date: new Date(),
        snippet: 'Test',
        eml_path: '/tmp/test.eml',
        is_encrypted: false,
      })

      const result = await getSharedMail('abc')
      expect(result).toBeNull()
    })

    it('returns null for encrypted mails', async () => {
      mockExecuteTakeFirst.mockResolvedValue({
        share_id: 'share-1',
        token: 'abc',
        expires_at: new Date(Date.now() + 86400000),
        access_count: 0,
        max_access: null,
        mail_id: 'mail-1',
        subject: 'Test',
        sender: 'alice@test.com',
        recipient: 'bob@test.com',
        date: new Date(),
        snippet: 'Test',
        eml_path: '/tmp/test.eml',
        is_encrypted: true,
      })

      const result = await getSharedMail('abc')
      expect(result).toBeNull()
    })
  })

  describe('revokeShare', () => {
    it('returns true when deleted', async () => {
      const result = await revokeShare('share-1', 'user-1')
      expect(result).toBe(true)
    })
  })
})
