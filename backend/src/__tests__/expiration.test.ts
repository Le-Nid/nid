import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 4000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '30d',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/auth/gmail/callback',
    GOOGLE_SSO_REDIRECT_URI: '',
    FRONTEND_URL: 'http://localhost:3000',
    ARCHIVE_PATH: '/tmp/archives',
    ADMIN_EMAIL: '',
    ALLOW_REGISTRATION: true,
    GMAIL_BATCH_SIZE: 25,
    GMAIL_THROTTLE_MS: 1000,
    GMAIL_CONCURRENCY: 10,
  },
}))

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()
const mockReturningAll = vi.fn(() => ({
  executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  execute: mockExecute,
}))
const mockOnConflict = vi.fn(() => ({ returningAll: mockReturningAll }))

const mockChain = {
  selectAll: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  values: vi.fn(() => ({ onConflict: mockOnConflict, returningAll: mockReturningAll })),
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      execute: mockExecute,
      where: vi.fn(() => ({
        execute: mockExecute,
        returningAll: mockReturningAll,
      })),
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
        where: vi.fn(() => ({ execute: vi.fn() })),
      })),
    })),
  })),
}))

vi.mock('../gmail/gmail.service', () => ({
  trashMessages: vi.fn(),
}))

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))

import { detectCategory, getSuggestedDays, getExpirations, createExpiration, processExpiredEmails } from '../expiration/expiration.service'
import { trashMessages } from '../gmail/gmail.service'

describe('Expiration Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectCategory', () => {
    it('detects OTP emails by subject', () => {
      expect(detectCategory('Your verification code is 123456', null)).toBe('otp')
      expect(detectCategory('Code de vérification', null)).toBe('otp')
      expect(detectCategory('Sign-in attempt', null)).toBe('otp')
    })

    it('detects delivery emails', () => {
      expect(detectCategory('Your package has been shipped', null)).toBe('delivery')
      expect(detectCategory('Votre colis est en livraison', null)).toBe('delivery')
      expect(detectCategory('Suivi de commande #12345', null)).toBe('delivery')
    })

    it('detects promo emails', () => {
      expect(detectCategory('Flash sale: 50% off everything!', null)).toBe('promo')
      expect(detectCategory('Offre exclusive pour vous', null)).toBe('promo')
      expect(detectCategory('Code promo SUMMER20', null)).toBe('promo')
    })

    it('detects by sender patterns', () => {
      expect(detectCategory(null, 'noreply@security.google.com')).toBe('otp')
      expect(detectCategory(null, 'tracking@ups.com')).toBe('delivery')
      expect(detectCategory(null, 'newsletter@deals.store.com')).toBe('promo')
    })

    it('returns null for regular emails', () => {
      expect(detectCategory('Meeting tomorrow at 10am', 'bob@company.com')).toBeNull()
      expect(detectCategory('Q3 Financial Report', 'finance@company.com')).toBeNull()
    })
  })

  describe('getSuggestedDays', () => {
    it('returns correct defaults per category', () => {
      expect(getSuggestedDays('otp')).toBe(1)
      expect(getSuggestedDays('delivery')).toBe(14)
      expect(getSuggestedDays('promo')).toBe(7)
      expect(getSuggestedDays('unknown')).toBe(7)
    })
  })

  describe('getExpirations', () => {
    it('queries with correct filters', async () => {
      mockExecute.mockResolvedValue([])
      const result = await getExpirations('account-1')
      expect(result).toEqual([])
    })
  })

  describe('createExpiration', () => {
    it('creates with expiresInDays', async () => {
      const mockResult = {
        id: 'exp-1',
        gmail_account_id: 'acc-1',
        gmail_message_id: 'msg-1',
        category: 'otp',
        expires_at: new Date(),
      }
      mockExecuteTakeFirstOrThrow.mockResolvedValue(mockResult)

      const result = await createExpiration('acc-1', {
        gmailMessageId: 'msg-1',
        category: 'otp',
        expiresInDays: 1,
      })

      expect(result).toEqual(mockResult)
    })

    it('creates with explicit expiresAt', async () => {
      const mockResult = {
        id: 'exp-2',
        gmail_account_id: 'acc-1',
        gmail_message_id: 'msg-2',
      }
      mockExecuteTakeFirstOrThrow.mockResolvedValue(mockResult)

      const result = await createExpiration('acc-1', {
        gmailMessageId: 'msg-2',
        expiresAt: '2026-12-31T00:00:00Z',
      })

      expect(result).toEqual(mockResult)
    })
  })

  describe('processExpiredEmails', () => {
    it('returns zero counts when no expired emails', async () => {
      mockExecute.mockResolvedValue([])
      const result = await processExpiredEmails()
      expect(result).toEqual({ processed: 0, errors: 0 })
    })

    it('trashes expired emails and marks them deleted', async () => {
      mockExecute.mockResolvedValueOnce([
        {
          id: 'exp-1',
          gmail_account_id: 'acc-1',
          gmail_message_id: 'msg-1',
          subject: 'OTP code',
        },
      ]).mockResolvedValue(undefined)

      vi.mocked(trashMessages).mockResolvedValue(undefined)

      const result = await processExpiredEmails()
      expect(result.processed).toBe(1)
      expect(trashMessages).toHaveBeenCalledWith('acc-1', ['msg-1'])
    })
  })
})
