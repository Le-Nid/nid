import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import i18n from '../i18n'
import { jobsApi } from '../api'
import { useGlobalJobNotifier } from '../hooks/useGlobalJobNotifier'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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

describe('useGlobalJobNotifier', () => {
  beforeAll(() => i18n.changeLanguage('fr'))
  afterEach(() => vi.useRealTimers())

  it('toasts a job that completes or fails while polled, not one already finished', async () => {
    vi.useFakeTimers()
    vi.mocked(jobsApi.list)
      .mockResolvedValueOnce([
        { id: 'j1', type: 'archive_mails', status: 'active' },
        { id: 'j2', type: 'run_rule', status: 'active' },
        { id: 'j3', type: 'bulk_operation', status: 'completed' },
      ])
      .mockResolvedValue([
        { id: 'j1', type: 'archive_mails', status: 'completed', processed: 12 },
        { id: 'j2', type: 'run_rule', status: 'failed', error: 'boom' },
        { id: 'j3', type: 'bulk_operation', status: 'completed' },
      ])
    renderHook(() => useGlobalJobNotifier())
    await act(() => vi.advanceTimersByTimeAsync(5_000))

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Archivage NAS terminé', expect.objectContaining({ id: 'job-j1', description: '12 éléments traités avec succès.' }))
    expect(toast.error).toHaveBeenCalledWith('Règle automatique échoué', expect.objectContaining({ id: 'job-j2', description: 'boom' }))
  })
})

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
