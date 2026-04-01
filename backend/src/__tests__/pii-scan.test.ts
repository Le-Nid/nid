import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
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

const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({ default: { readFile: (...args: any[]) => mockReadFile(...args) }, readFile: (...args: any[]) => mockReadFile(...args) }))

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn(),
}))

import { scanArchivePii, getPiiStats, listPiiFindings } from '../privacy/pii.service'

beforeEach(() => vi.clearAllMocks())

describe('scanArchivePii', () => {
  it('scans EML files and inserts PII findings', async () => {
    // Already scanned: none
    mockExecute
      .mockResolvedValueOnce([]) // selectFrom pii_findings (already scanned)
      .mockResolvedValueOnce([   // selectFrom archived_mails
        { id: 'mail-1', eml_path: '/archives/mail1.eml' },
        { id: 'mail-2', eml_path: '/archives/mail2.eml' },
      ])

    // mail-1 has a credit card number, mail-2 has no PII
    mockReadFile
      .mockResolvedValueOnce('Payment with card 4111111111111111 confirmed')
      .mockResolvedValueOnce('Hello world, nothing sensitive here')

    // DB inserts for PII findings
    mockExecute.mockResolvedValue([])

    const result = await scanArchivePii('acc-1')

    expect(result.scanned).toBe(2)
    expect(result.withPii).toBe(1)
    expect(result.findings).toBeGreaterThanOrEqual(1)
  })

  it('skips already scanned mails', async () => {
    mockExecute
      .mockResolvedValueOnce([{ archived_mail_id: 'mail-1' }]) // already scanned
      .mockResolvedValueOnce([{ id: 'mail-1', eml_path: '/a.eml' }]) // all mails

    const result = await scanArchivePii('acc-1')
    expect(result.scanned).toBe(0)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('calls onProgress callback', async () => {
    mockExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'mail-1', eml_path: '/a.eml' }])

    mockReadFile.mockResolvedValueOnce('No PII here')
    mockExecute.mockResolvedValue([])

    const onProgress = vi.fn()
    await scanArchivePii('acc-1', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('handles file read errors gracefully', async () => {
    mockExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'mail-1', eml_path: '/missing.eml' }])

    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await scanArchivePii('acc-1')
    expect(result.scanned).toBe(1)
    expect(result.withPii).toBe(0)
  })
})

describe('getPiiStats', () => {
  it('aggregates PII stats by type', async () => {
    mockExecute
      .mockResolvedValueOnce([
        { pii_type: 'credit_card', count: 3 },
        { pii_type: 'email', count: 5 },
        { pii_type: 'credit_card', count: 2 },
      ])
      .mockResolvedValueOnce([
        { archived_mail_id: 'mail-1' },
        { archived_mail_id: 'mail-2' },
      ])

    const stats = await getPiiStats('acc-1')

    expect(stats.totalFindings).toBe(10)
    expect(stats.affectedMails).toBe(2)
    expect(stats.byType).toContainEqual({ type: 'credit_card', count: 5 })
    expect(stats.byType).toContainEqual({ type: 'email', count: 5 })
  })
})

describe('listPiiFindings', () => {
  it('returns paginated findings', async () => {
    const rows = [
      { id: '1', archived_mail_id: 'mail-1', pii_type: 'credit_card', count: 1, snippet: '411...', scanned_at: new Date(), subject: 'Test', sender: 'a@b.com', date: new Date() },
    ]
    mockExecute.mockResolvedValueOnce(rows)
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })

    const result = await listPiiFindings('acc-1', { limit: 10, offset: 0 })
    expect(result.items).toEqual(rows)
    expect(result.total).toBe(1)
  })

  it('filters by piiType when provided', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 0 })

    const result = await listPiiFindings('acc-1', { limit: 10, offset: 0, piiType: 'credit_card' })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})
