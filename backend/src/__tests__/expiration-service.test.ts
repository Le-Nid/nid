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

import { processExpiredEmails } from '../expiration/expiration.service'

beforeEach(() => vi.clearAllMocks())

describe('processExpiredEmails', () => {
  it('returns zeros when no expired emails', async () => {
    mockExecute.mockResolvedValue([])
    const result = await processExpiredEmails()
    expect(result).toEqual({ processed: 0, errors: 0 })
  })

  it('processes expired emails grouped by account', async () => {
    const { trashMessages } = await import('../gmail/gmail.service')
    const expired = [
      { id: 'e1', account_id: 'acc-1', gmail_message_id: 'msg-1', subject: 'OTP' },
      { id: 'e2', account_id: 'acc-1', gmail_message_id: 'msg-2', subject: 'Promo' },
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
      { id: 'e1', account_id: 'acc-1', gmail_message_id: 'msg-1', subject: 'OTP' },
    ]
    mockExecute.mockResolvedValueOnce(expired)
    ;(trashMessages as any).mockRejectedValue(new Error('Gmail error'))

    const result = await processExpiredEmails()
    expect(result.errors).toBe(1)
    expect(result.processed).toBe(0)
  })
})
