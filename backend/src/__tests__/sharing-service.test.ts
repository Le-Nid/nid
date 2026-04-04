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

vi.mock('../config', () => ({
  config: { ARCHIVE_PATH: '/tmp/archives' },
}))

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('mock eml content'),
  },
}))

vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockResolvedValue({
    html: '<p>Hello</p>',
    text: 'Hello',
    subject: 'Test',
    from: { text: 'alice@test.com' },
    to: { text: 'bob@test.com' },
    date: new Date('2024-01-01'),
  }),
}))

import {
  createShareLink,
  getSharedMail,
  getUserShares,
  revokeShare,
  cleanupExpiredShares,
} from '../archive/sharing.service'

beforeEach(() => vi.clearAllMocks())

describe('createShareLink', () => {
  it('creates a share link for owned mail', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'mail-1',
      subject: 'Test',
      sender: 'alice@test.com',
      date: new Date('2024-01-01'),
      eml_path: '/tmp/test.eml',
    })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'share-1',
      token: 'abc123',
      expires_at: new Date().toISOString(),
    })

    const result = await createShareLink('user-1', {
      archivedMailId: 'mail-1',
      expiresInHours: 24,
    })
    expect(result.subject).toBe('Test')
    expect(result.sender).toBe('alice@test.com')
  })

  it('throws when mail not found', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    await expect(
      createShareLink('user-1', { archivedMailId: 'nonexistent' })
    ).rejects.toThrow('Archived mail not found or access denied')
  })

  it('uses default 24h expiration', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      id: 'mail-1', subject: 'Test', sender: 'a@b.com', date: new Date(), eml_path: '/tmp/t.eml',
    })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'share-1', token: 'token', expires_at: new Date().toISOString(),
    })

    const result = await createShareLink('user-1', { archivedMailId: 'mail-1' })
    expect(result).toBeDefined()
  })
})

describe('getSharedMail', () => {
  it('returns null when share not found', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    const result = await getSharedMail('invalid-token')
    expect(result).toBeNull()
  })

  it('returns null when share expired', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      share_id: 's1',
      expires_at: new Date('2020-01-01').toISOString(),
      access_count: 0,
      max_access: null,
      is_encrypted: false,
      eml_path: '/tmp/test.eml',
    })
    const result = await getSharedMail('expired-token')
    expect(result).toBeNull()
  })

  it('returns null when max access reached', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      share_id: 's1',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      access_count: 5,
      max_access: 5,
      is_encrypted: false,
    })
    const result = await getSharedMail('maxed-token')
    expect(result).toBeNull()
  })

  it('returns null when mail is encrypted', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      share_id: 's1',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      access_count: 0,
      max_access: null,
      is_encrypted: true,
    })
    const result = await getSharedMail('encrypted-token')
    expect(result).toBeNull()
  })

  it('returns mail content and increments access count', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      share_id: 's1',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      access_count: 0,
      max_access: 10,
      is_encrypted: false,
      subject: 'Shared Subject',
      sender: 'alice@test.com',
      recipient: 'bob@test.com',
      date: new Date('2024-01-01'),
      snippet: 'Hello...',
      eml_path: '/tmp/test.eml',
    })
    mockExecute.mockResolvedValueOnce([]) // update access_count

    const result = await getSharedMail('valid-token')
    expect(result).not.toBeNull()
    expect(result!.subject).toBe('Shared Subject')
    expect(result!.htmlBody).toBe('<p>Hello</p>')
    expect(result!.textBody).toBe('Hello')
    expect(mockExecute).toHaveBeenCalled() // access count incremented
  })
})

describe('getUserShares', () => {
  it('returns user shares ordered by created_at desc', async () => {
    const shares = [{ id: 's1', token: 'abc' }]
    mockExecute.mockResolvedValue(shares)
    const result = await getUserShares('user-1')
    expect(result).toEqual(shares)
  })
})

describe('revokeShare', () => {
  it('returns true when share deleted', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(1) })
    const result = await revokeShare('s1', 'user-1')
    expect(result).toBe(true)
  })

  it('returns false when share not found', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(0) })
    const result = await revokeShare('s1', 'user-1')
    expect(result).toBe(false)
  })
})

describe('cleanupExpiredShares', () => {
  it('returns count of cleaned up shares', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(5) })
    const result = await cleanupExpiredShares()
    expect(result).toBe(5)
  })

  it('returns 0 when no expired shares', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: BigInt(0) })
    const result = await cleanupExpiredShares()
    expect(result).toBe(0)
  })
})
