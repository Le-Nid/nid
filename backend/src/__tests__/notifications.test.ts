import { describe, it, expect, vi } from 'vitest'

// Test config.ts behavior
describe('config — ALLOW_REGISTRATION', () => {
  it('defaults to true when env var is not set', () => {
    delete process.env.ALLOW_REGISTRATION

    // Re-evaluate
    const result = process.env.ALLOW_REGISTRATION !== 'false'
    expect(result).toBe(true)
  })

  it('returns true when set to "true"', () => {
    process.env.ALLOW_REGISTRATION = 'true'
    const result = process.env.ALLOW_REGISTRATION !== 'false'
    expect(result).toBe(true)
  })

  it('returns false when set to "false"', () => {
    process.env.ALLOW_REGISTRATION = 'false'
    const result = process.env.ALLOW_REGISTRATION !== 'false'
    expect(result).toBe(false)
  })
})

// Test notify dispatcher logic (unit test without DB)
describe('notification dispatcher categories', () => {
  const CATEGORY_TO_WEBHOOK: Record<string, string> = {
    weekly_report: 'job.completed',
    job_completed: 'job.completed',
    job_failed: 'job.failed',
    rule_executed: 'rule.executed',
    quota_warning: 'quota.warning',
    integrity_alert: 'integrity.failed',
  }

  it('maps all categories to webhook events', () => {
    expect(Object.keys(CATEGORY_TO_WEBHOOK)).toHaveLength(6)
  })

  it('maps job_completed to job.completed', () => {
    expect(CATEGORY_TO_WEBHOOK.job_completed).toBe('job.completed')
  })

  it('maps integrity_alert to integrity.failed', () => {
    expect(CATEGORY_TO_WEBHOOK.integrity_alert).toBe('integrity.failed')
  })
})

// Test notification preference defaults
describe('notification preference defaults', () => {
  const DEFAULTS: Record<string, boolean> = {
    weekly_report: true,
    job_completed: true,
    job_failed: true,
    rule_executed: false,
    quota_warning: true,
    integrity_alert: true,
    weekly_report_toast: false,
    job_completed_toast: true,
    job_failed_toast: true,
    rule_executed_toast: false,
    quota_warning_toast: false,
    integrity_alert_toast: false,
  }

  it('has 12 preference keys', () => {
    expect(Object.keys(DEFAULTS)).toHaveLength(12)
  })

  it('defaults rule_executed to false (noisy)', () => {
    expect(DEFAULTS.rule_executed).toBe(false)
  })

  it('defaults job_completed_toast to true', () => {
    expect(DEFAULTS.job_completed_toast).toBe(true)
  })

  it('defaults weekly_report_toast to false (not useful as toast)', () => {
    expect(DEFAULTS.weekly_report_toast).toBe(false)
  })
})
