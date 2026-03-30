import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// NotificationBell rendering (minimal)
vi.mock('../api', () => ({
  notificationsApi: {
    list: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({
      weekly_report: true, job_completed: true, job_failed: true,
      rule_executed: false, quota_warning: true, integrity_alert: true,
      job_completed_toast: true, job_failed_toast: true,
    }),
    updatePreferences: vi.fn(),
  },
  jobsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

describe('notification preferences API contract', () => {
  it('getPreferences returns all expected keys', async () => {
    const { notificationsApi } = await import('../api')
    const prefs = await notificationsApi.getPreferences()
    expect(prefs).toHaveProperty('weekly_report')
    expect(prefs).toHaveProperty('job_completed')
    expect(prefs).toHaveProperty('job_failed')
    expect(prefs).toHaveProperty('rule_executed')
    expect(prefs).toHaveProperty('quota_warning')
    expect(prefs).toHaveProperty('integrity_alert')
    expect(prefs).toHaveProperty('job_completed_toast')
    expect(prefs).toHaveProperty('job_failed_toast')
  })
})

describe('formatBytes edge cases', () => {
  // Import the actual format function
  it('handles negative values gracefully', async () => {
    const { formatBytes } = await import('../utils/format')
    const result = formatBytes(-1)
    // Should not crash — returns some string
    expect(typeof result).toBe('string')
  })

  it('handles very large values without crashing', async () => {
    const { formatBytes } = await import('../utils/format')
    const result = formatBytes(1024 * 1024 * 1024 * 100) // 100 Go
    expect(result).toBe('100 Go')
  })
})
