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

vi.mock('../gmail/gmail.service', () => ({
  trashMessages: vi.fn(),
}))

import {
  getExpirations,
  getExpiration,
  createExpiration,
  createExpirationsBatch,
  deleteExpiration,
  updateExpirationDate,
  detectCategory,
  getSuggestedDays,
  processExpiredEmails,
  getExpirationStats,
} from '../expiration/expiration.service'

beforeEach(() => vi.clearAllMocks())

describe('detectCategory', () => {
  it('detects OTP subject', () => {
    expect(detectCategory('Your OTP code', null)).toBe('otp')
    expect(detectCategory('Verification code', null)).toBe('otp')
    expect(detectCategory('Your security code', null)).toBe('otp')
  })

  it('detects OTP sender', () => {
    expect(detectCategory(null, 'noreply@google.com')).toBe('otp')
    expect(detectCategory(null, 'security@bank.com')).toBe('otp')
  })

  it('detects delivery subject', () => {
    expect(detectCategory('Votre colis a été expédié', null)).toBe('delivery')
    expect(detectCategory('Your order has shipped', null)).toBe('delivery')
    expect(detectCategory('Package tracking update', null)).toBe('delivery')
  })

  it('detects delivery sender', () => {
    expect(detectCategory(null, 'tracking@ups.com')).toBe('delivery')
    expect(detectCategory(null, 'notifications@amazon.com')).toBe('delivery')
    expect(detectCategory(null, 'info@dhl.com')).toBe('delivery')
  })

  it('detects promo subject', () => {
    expect(detectCategory('Flash sale - 50% off', null)).toBe('promo')
    expect(detectCategory('Votre code promo', null)).toBe('promo')
    expect(detectCategory('Offre exclusive pour vous', null)).toBe('promo')
  })

  it('detects promo sender', () => {
    expect(detectCategory(null, 'newsletter@shop.com')).toBe('promo')
    expect(detectCategory(null, 'marketing@brand.com')).toBe('promo')
  })

  it('returns null for unrecognized patterns', () => {
    expect(detectCategory('Meeting notes', 'colleague@work.com')).toBeNull()
    expect(detectCategory(null, null)).toBeNull()
  })
})

describe('getSuggestedDays', () => {
  it('returns correct defaults per category', () => {
    expect(getSuggestedDays('otp')).toBe(1)
    expect(getSuggestedDays('delivery')).toBe(14)
    expect(getSuggestedDays('promo')).toBe(7)
  })

  it('returns 7 for unknown category', () => {
    expect(getSuggestedDays('unknown')).toBe(7)
  })
})

describe('getExpirations', () => {
  it('queries by account and returns results', async () => {
    const data = [{ id: 'e1', subject: 'test' }]
    mockExecute.mockResolvedValue(data)
    const result = await getExpirations('acc-1')
    expect(result).toEqual(data)
  })
})

describe('getExpiration', () => {
  it('returns single expiration', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ id: 'e1' })
    const result = await getExpiration('e1', 'acc-1')
    expect(result).toEqual({ id: 'e1' })
  })

  it('returns null when not found', async () => {
    mockExecuteTakeFirst.mockResolvedValue(undefined)
    const result = await getExpiration('e1', 'acc-1')
    // The result is the falsy value from executeTakeFirst via ?? null
    expect(result).toBeFalsy()
  })
})

describe('createExpiration', () => {
  it('creates with expiresInDays', async () => {
    const created = { id: 'e1', category: 'manual' }
    mockExecuteTakeFirstOrThrow.mockResolvedValue(created)
    const result = await createExpiration('acc-1', {
      gmailMessageId: 'msg-1',
      expiresInDays: 7,
    })
    expect(result).toEqual(created)
  })

  it('creates with expiresAt', async () => {
    const created = { id: 'e1', category: 'manual' }
    mockExecuteTakeFirstOrThrow.mockResolvedValue(created)
    const result = await createExpiration('acc-1', {
      gmailMessageId: 'msg-1',
      expiresAt: '2025-12-31T00:00:00Z',
    })
    expect(result).toEqual(created)
  })
})

describe('createExpirationsBatch', () => {
  it('creates multiple expirations', async () => {
    const created = [{ id: 'e1' }, { id: 'e2' }]
    mockExecute.mockResolvedValue(created)
    const result = await createExpirationsBatch('acc-1', [
      { gmailMessageId: 'msg-1', expiresInDays: 3 },
      { gmailMessageId: 'msg-2', expiresAt: '2025-12-31T00:00:00Z' },
    ])
    expect(result).toEqual(created)
  })

  it('returns empty array for empty input', async () => {
    const result = await createExpirationsBatch('acc-1', [])
    expect(result).toEqual([])
  })
})

describe('deleteExpiration', () => {
  it('deletes by id and account', async () => {
    mockExecute.mockResolvedValue([])
    await deleteExpiration('e1', 'acc-1')
    expect(mockExecute).toHaveBeenCalled()
  })
})

describe('updateExpirationDate', () => {
  it('updates the expiration date', async () => {
    const updated = { id: 'e1', expires_at: '2025-12-31T00:00:00.000Z' }
    mockExecuteTakeFirstOrThrow.mockResolvedValue(updated)
    const result = await updateExpirationDate('e1', 'acc-1', '2025-12-31T00:00:00Z')
    expect(result).toEqual(updated)
  })
})

describe('processExpiredEmails', () => {
  it('returns zeros when no expired emails', async () => {
    mockExecute.mockResolvedValue([])
    const result = await processExpiredEmails()
    expect(result).toEqual({ processed: 0, errors: 0 })
  })

  it('processes expired emails grouped by account', async () => {
    const { trashMessages } = await import('../gmail/gmail.service')
    const expired = [
      { id: 'e1', gmail_account_id: 'acc-1', gmail_message_id: 'msg-1', subject: 'OTP' },
      { id: 'e2', gmail_account_id: 'acc-1', gmail_message_id: 'msg-2', subject: 'Promo' },
    ]
    mockExecute
      .mockResolvedValueOnce(expired) // find expired
      .mockResolvedValueOnce([]) // updateTable mark deleted
    ;(trashMessages as any).mockResolvedValue(undefined)

    const result = await processExpiredEmails()
    expect(result.processed).toBe(2)
    expect(result.errors).toBe(0)
    expect(trashMessages).toHaveBeenCalledWith('acc-1', ['msg-1', 'msg-2'])
  })

  it('handles trash failure gracefully', async () => {
    const { trashMessages } = await import('../gmail/gmail.service')
    const expired = [
      { id: 'e1', gmail_account_id: 'acc-1', gmail_message_id: 'msg-1', subject: 'OTP' },
    ]
    mockExecute.mockResolvedValueOnce(expired)
    ;(trashMessages as any).mockRejectedValue(new Error('Gmail error'))

    const result = await processExpiredEmails()
    expect(result.errors).toBe(1)
    expect(result.processed).toBe(0)
  })
})

describe('getExpirationStats', () => {
  it('returns all stat counters', async () => {
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 10 })  // total
      .mockResolvedValueOnce({ count: 5 })   // pending
      .mockResolvedValueOnce({ count: 3 })   // deleted
      .mockResolvedValueOnce({ count: 2 })   // expiringSoon

    const stats = await getExpirationStats('acc-1')
    expect(stats).toEqual({ total: 10, pending: 5, deleted: 3, expiringSoon: 2 })
  })
})
