import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
  }),
}))

import { shouldNotify, NOTIFICATION_DEFAULTS } from '../notifications/notification-prefs.service'

beforeEach(() => vi.clearAllMocks())

describe('shouldNotify', () => {
  it('returns default when no preferences row', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    expect(await shouldNotify('user-1', 'job_completed')).toBe(true)
    expect(await shouldNotify('user-1', 'rule_executed')).toBe(false)
  })

  it('returns user preference when row exists', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ job_completed: false })
    expect(await shouldNotify('user-1', 'job_completed')).toBe(false)
  })

  it('returns true for enabled preference', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ weekly_report: true })
    expect(await shouldNotify('user-1', 'weekly_report')).toBe(true)
  })
})

describe('NOTIFICATION_DEFAULTS', () => {
  it('has correct defaults', () => {
    expect(NOTIFICATION_DEFAULTS.weekly_report).toBe(true)
    expect(NOTIFICATION_DEFAULTS.job_completed).toBe(true)
    expect(NOTIFICATION_DEFAULTS.job_failed).toBe(true)
    expect(NOTIFICATION_DEFAULTS.rule_executed).toBe(false)
    expect(NOTIFICATION_DEFAULTS.quota_warning).toBe(true)
    expect(NOTIFICATION_DEFAULTS.integrity_alert).toBe(true)
  })

  it('has correct toast defaults', () => {
    expect(NOTIFICATION_DEFAULTS.weekly_report_toast).toBe(false)
    expect(NOTIFICATION_DEFAULTS.job_completed_toast).toBe(true)
    expect(NOTIFICATION_DEFAULTS.job_failed_toast).toBe(true)
    expect(NOTIFICATION_DEFAULTS.rule_executed_toast).toBe(false)
    expect(NOTIFICATION_DEFAULTS.quota_warning_toast).toBe(false)
    expect(NOTIFICATION_DEFAULTS.integrity_alert_toast).toBe(false)
  })

  it('has 12 categories', () => {
    expect(Object.keys(NOTIFICATION_DEFAULTS)).toHaveLength(12)
  })
})
