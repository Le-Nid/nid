import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    groupBy: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    distinct: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    constraint: () => chain,
    doUpdateSet: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
    updateTable: () => chainable(),
    deleteFrom: () => chainable(),
  }),
}))

vi.mock('pino', () => ({ default: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

// ─── Imports ────────────────────────────────────────────────
import { getPiiStats, listPiiFindings } from '../privacy/pii.service'
import { getTrackingStats, listTrackedMessages } from '../privacy/tracking.service'

beforeEach(() => vi.clearAllMocks())

// ─── getPiiStats ────────────────────────────────────────────
describe('getPiiStats', () => {
  it('returns aggregated stats', async () => {
    mockExecute
      .mockResolvedValueOnce([
        { pii_type: 'credit_card', count: 3 },
        { pii_type: 'iban', count: 1 },
        { pii_type: 'credit_card', count: 2 },
      ]) // findings
      .mockResolvedValueOnce([
        { archived_mail_id: 'm1' },
        { archived_mail_id: 'm2' },
      ]) // affected mails

    const result = await getPiiStats('acc-1')
    expect(result.totalFindings).toBe(6)
    expect(result.affectedMails).toBe(2)
    expect(result.byType).toEqual(
      expect.arrayContaining([
        { type: 'credit_card', count: 5 },
        { type: 'iban', count: 1 },
      ]),
    )
  })

  it('returns zeros when no findings', async () => {
    mockExecute
      .mockResolvedValueOnce([]) // no findings
      .mockResolvedValueOnce([]) // no affected mails

    const result = await getPiiStats('acc-1')
    expect(result.totalFindings).toBe(0)
    expect(result.affectedMails).toBe(0)
    expect(result.byType).toEqual([])
  })
})

// ─── listPiiFindings ────────────────────────────────────────
describe('listPiiFindings', () => {
  it('returns paginated findings', async () => {
    mockExecute.mockResolvedValue([
      { id: 'f1', pii_type: 'credit_card', count: 1, subject: 'Test', sender: 'a@b.com' },
    ])
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 1 })

    const result = await listPiiFindings('acc-1', { limit: 10, offset: 0 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('supports piiType filter', async () => {
    mockExecute.mockResolvedValue([])
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 0 })

    const result = await listPiiFindings('acc-1', { limit: 10, offset: 0, piiType: 'iban' })
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})

// ─── getTrackingStats ───────────────────────────────────────
describe('getTrackingStats', () => {
  it('returns tracking stats with top domains', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 50 })
    mockExecute
      .mockResolvedValueOnce([]) // byDomain (count query)
      .mockResolvedValueOnce([   // rows with trackers
        {
          trackers: [
            { type: 'known_domain', domain: 'mailchimp.com' },
            { type: 'pixel', domain: 'tracker.com' },
          ],
          tracker_count: 2,
        },
        {
          trackers: [{ type: 'known_domain', domain: 'mailchimp.com' }],
          tracker_count: 1,
        },
      ])

    const result = await getTrackingStats('acc-1')
    expect(result.trackedMessages).toBe(50)
    expect(result.totalTrackers).toBe(3)
    expect(result.topDomains[0].domain).toBe('mailchimp.com')
    expect(result.topDomains[0].count).toBe(2)
  })

  it('returns empty stats when no tracked messages', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 0 })
    mockExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getTrackingStats('acc-1')
    expect(result.trackedMessages).toBe(0)
    expect(result.totalTrackers).toBe(0)
    expect(result.topDomains).toEqual([])
  })
})

// ─── listTrackedMessages ────────────────────────────────────
describe('listTrackedMessages', () => {
  it('returns paginated tracked messages', async () => {
    mockExecute.mockResolvedValue([
      { id: 't1', gmail_message_id: 'm1', subject: 'Test', tracker_count: 3 },
    ])
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ count: 1 })

    const result = await listTrackedMessages('acc-1', { limit: 10, offset: 0 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})
