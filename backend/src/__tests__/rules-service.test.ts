import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()
const mockExecuteTakeFirst = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    innerJoin: () => chain,
    insertInto: () => chain,
    values: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    onConflict: () => chain,
    columns: () => chain,
    doUpdateSet: () => chain,
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

const mockListMessages = vi.fn()
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...args: any[]) => mockListMessages(...args),
}))

const mockEnqueueJob = vi.fn()
vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
}))

// ─── Import after mocks ────────────────────────────────────
import {
  buildGmailQuery,
  getRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  runRule,
} from '../rules/rules.service'
import type { RuleCondition } from '../rules/rules.types'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── buildGmailQuery ───────────────────────────────────────
describe('buildGmailQuery', () => {
  it('builds from condition with contains', () => {
    const conditions: RuleCondition[] = [
      { field: 'from', operator: 'contains', value: 'newsletter@example.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('from:(newsletter@example.com)')
  })

  it('builds from condition with equals', () => {
    const conditions: RuleCondition[] = [
      { field: 'from', operator: 'equals', value: 'user@test.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('from:(user@test.com)')
  })

  it('builds negated from condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'from', operator: 'not_contains', value: 'keep@test.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('-from:(keep@test.com)')
  })

  it('builds not_equals from condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'from', operator: 'not_equals', value: 'keep@test.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('-from:(keep@test.com)')
  })

  it('builds to condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'to', operator: 'contains', value: 'me@test.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('to:(me@test.com)')
  })

  it('builds negated to condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'to', operator: 'not_contains', value: 'other@test.com' },
    ]
    expect(buildGmailQuery(conditions)).toBe('-to:(other@test.com)')
  })

  it('builds subject condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'subject', operator: 'contains', value: 'URGENT' },
    ]
    expect(buildGmailQuery(conditions)).toBe('subject:(URGENT)')
  })

  it('builds negated subject condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'subject', operator: 'not_contains', value: 'spam' },
    ]
    expect(buildGmailQuery(conditions)).toBe('-subject:(spam)')
  })

  it('builds has_attachment true', () => {
    const conditions: RuleCondition[] = [
      { field: 'has_attachment', operator: 'is_true', value: true },
    ]
    expect(buildGmailQuery(conditions)).toBe('has:attachment')
  })

  it('builds has_attachment false', () => {
    const conditions: RuleCondition[] = [
      { field: 'has_attachment', operator: 'is_true', value: false },
    ]
    expect(buildGmailQuery(conditions)).toBe('-has:attachment')
  })

  it('builds has_attachment string true', () => {
    const conditions: RuleCondition[] = [
      { field: 'has_attachment', operator: 'is_true', value: 'true' },
    ]
    expect(buildGmailQuery(conditions)).toBe('has:attachment')
  })

  it('builds size_gt condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'size_gt', operator: 'gt', value: '10M' },
    ]
    expect(buildGmailQuery(conditions)).toBe('larger:10M')
  })

  it('builds size_lt condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'size_lt', operator: 'lt', value: '5M' },
    ]
    expect(buildGmailQuery(conditions)).toBe('smaller:5M')
  })

  it('builds older_than condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'older_than', operator: 'gt', value: '30d' },
    ]
    expect(buildGmailQuery(conditions)).toBe('older_than:30d')
  })

  it('builds newer_than condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'newer_than', operator: 'gt', value: '7d' },
    ]
    expect(buildGmailQuery(conditions)).toBe('newer_than:7d')
  })

  it('builds label equals condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'label', operator: 'equals', value: 'INBOX' },
    ]
    expect(buildGmailQuery(conditions)).toBe('label:INBOX')
  })

  it('builds label not_equals condition', () => {
    const conditions: RuleCondition[] = [
      { field: 'label', operator: 'not_equals', value: 'SPAM' },
    ]
    expect(buildGmailQuery(conditions)).toBe('-label:SPAM')
  })

  it('combines multiple conditions with space', () => {
    const conditions: RuleCondition[] = [
      { field: 'from', operator: 'contains', value: 'test@test.com' },
      { field: 'older_than', operator: 'gt', value: '7d' },
      { field: 'has_attachment', operator: 'is_true', value: true },
    ]
    expect(buildGmailQuery(conditions)).toBe('from:(test@test.com) older_than:7d has:attachment')
  })

  it('returns empty string for no conditions', () => {
    expect(buildGmailQuery([])).toBe('')
  })
})

// ─── CRUD operations ──────────────────────────────────────
describe('getRules', () => {
  it('calls db and returns rules', async () => {
    const rules = [{ id: 'r1', name: 'rule1' }]
    mockExecute.mockResolvedValue(rules)
    const result = await getRules('acc-1')
    expect(result).toEqual(rules)
  })
})

describe('getRule', () => {
  it('returns rule when found', async () => {
    const rule = { id: 'r1', name: 'rule1' }
    mockExecuteTakeFirst.mockResolvedValue(rule)
    const result = await getRule('r1', 'acc-1')
    expect(result).toEqual(rule)
  })
})

describe('createRule', () => {
  it('inserts rule and returns it', async () => {
    const rule = { id: 'r1', name: 'new rule' }
    mockExecuteTakeFirstOrThrow.mockResolvedValue(rule)
    const result = await createRule('acc-1', {
      name: 'new rule',
      conditions: [{ field: 'from', operator: 'contains', value: 'test' }],
      action: { type: 'trash' },
    })
    expect(result).toEqual(rule)
  })
})

describe('updateRule', () => {
  it('updates and returns rule', async () => {
    const rule = { id: 'r1', name: 'updated' }
    mockExecuteTakeFirstOrThrow.mockResolvedValue(rule)
    const result = await updateRule('r1', 'acc-1', { name: 'updated' })
    expect(result).toEqual(rule)
  })
})

describe('deleteRule', () => {
  it('deletes rule', async () => {
    mockExecute.mockResolvedValue([])
    await deleteRule('r1', 'acc-1')
    expect(mockExecute).toHaveBeenCalled()
  })
})

// ─── runRule ──────────────────────────────────────────────
describe('runRule', () => {
  it('returns 0 matched when no messages found', async () => {
    mockListMessages.mockResolvedValue({ messages: [], nextPageToken: null })
    mockExecute.mockResolvedValue([])

    const result = await runRule(
      { id: 'r1', conditions: [{ field: 'from', operator: 'contains', value: 'test' }], action: { type: 'trash' } },
      'acc-1',
    )
    expect(result.matched).toBe(0)
    expect(result.processed).toBe(0)
  })

  it('enqueues bulk_operation job for trash action', async () => {
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: null })
    mockEnqueueJob.mockResolvedValue({ id: 'job-1' })
    mockExecute.mockResolvedValue([])

    const result = await runRule(
      { id: 'r1', conditions: [{ field: 'from', operator: 'contains', value: 'test' }], action: { type: 'trash' } },
      'acc-1',
    )
    expect(result.matched).toBe(2)
    expect(mockEnqueueJob).toHaveBeenCalledWith('bulk_operation', expect.objectContaining({
      accountId: 'acc-1',
      action: 'trash',
      messageIds: ['m1', 'm2'],
    }))
  })

  it('enqueues archive_mails job for archive_nas action', async () => {
    mockListMessages.mockResolvedValue({ messages: [{ id: 'm1' }], nextPageToken: null })
    mockEnqueueJob.mockResolvedValue({ id: 'job-2' })
    mockExecute.mockResolvedValue([])

    const result = await runRule(
      { id: 'r1', conditions: [], action: { type: 'archive_nas' } },
      'acc-1',
    )
    expect(mockEnqueueJob).toHaveBeenCalledWith('archive_mails', expect.objectContaining({
      accountId: 'acc-1',
      messageIds: ['m1'],
      differential: true,
    }))
    expect(result.jobId).toBe('job-2')
  })

  it('handles JSON string conditions/action', async () => {
    mockListMessages.mockResolvedValue({ messages: [], nextPageToken: null })
    mockExecute.mockResolvedValue([])

    const result = await runRule(
      {
        id: 'r1',
        conditions: JSON.stringify([{ field: 'from', operator: 'contains', value: 'x' }]),
        action: JSON.stringify({ type: 'trash' }),
      },
      'acc-1',
    )
    expect(result.matched).toBe(0)
  })
})
