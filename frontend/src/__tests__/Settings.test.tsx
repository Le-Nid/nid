import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App } from 'antd'
import api from '../api/client'

// ─── Mocks ──────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.defaultValue || key }),
}))

const mockFetchMe = vi.fn()

vi.mock('../store/auth.store', () => ({
  useAuthStore: () => ({
    user: { email: 'admin@test.com', display_name: 'Admin', role: 'admin', storage_quota_bytes: 5_368_709_120, max_gmail_accounts: 3 },
    gmailAccounts: [
      { id: 'acc-1', email: 'test@gmail.com', is_active: true },
      { id: 'acc-2', email: 'test2@gmail.com', is_active: false },
    ],
    fetchMe: mockFetchMe,
    storageUsedBytes: 1_073_741_824,
  }),
}))

vi.mock('react-router', () => ({
  useSearchParams: () => [new URLSearchParams()],
}))

vi.mock('../api', () => ({
  twoFactorApi: { getStatus: vi.fn().mockResolvedValue({ enabled: false }), setup: vi.fn(), verify: vi.fn(), disable: vi.fn() },
  webhooksApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn(), test: vi.fn() },
  configApi: { exportConfig: vi.fn(), importConfig: vi.fn() },
  notificationsApi: {
    getPreferences: vi.fn().mockResolvedValue({
      weekly_report: true, job_completed: true, job_failed: true,
      rule_executed: false, quota_warning: true, integrity_alert: true,
      weekly_report_toast: false, job_completed_toast: true, job_failed_toast: true,
      rule_executed_toast: false, quota_warning_toast: false, integrity_alert_toast: false,
    }),
    updatePreferences: vi.fn().mockResolvedValue({ ok: true }),
  },
  archiveApi: { triggerArchive: vi.fn().mockResolvedValue({ jobId: 'j-1' }) },
}))

vi.mock('../hooks/queries', () => ({
  useAuditLogs: () => ({ data: { data: [], total: 0 }, isLoading: false }),
  useWebhooks: () => ({ data: [] }),
  useNotificationPreferences: () => ({
    data: {
      weekly_report: true, job_completed: true, job_failed: true,
      rule_executed: false, quota_warning: true, integrity_alert: true,
      weekly_report_toast: false, job_completed_toast: true, job_failed_toast: true,
      rule_executed_toast: false, quota_warning_toast: false, integrity_alert_toast: false,
    },
  }),
}))

vi.mock('../components/JobProgressModal', () => ({
  default: () => null,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

import SettingsPage from '../pages/Settings'

function renderSettings() {
  return render(
    <App>
      <SettingsPage />
    </App>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.patch).mockResolvedValue({ data: {} })
  })

  it('renders settings page with title', () => {
    renderSettings()
    expect(screen.getByText('settings.title')).toBeInTheDocument()
  })

  it('renders gmail accounts with active and inactive tags', () => {
    renderSettings()
    expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('test2@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('common.active')).toBeInTheDocument()
    expect(screen.getByText('common.inactive')).toBeInTheDocument()
  })

  it('renders toggle buttons for enable/disable sync', () => {
    renderSettings()
    expect(screen.getByText('settings.disableSync')).toBeInTheDocument()
    expect(screen.getByText('settings.enableSync')).toBeInTheDocument()
  })

  it('calls toggleAccount and refreshes on confirm', async () => {
    renderSettings()

    const disableBtn = screen.getByText('settings.disableSync')
    fireEvent.click(disableBtn)

    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-primary')
      expect(okBtn).toBeInTheDocument()
    })

    const confirmBtn = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/auth/gmail/acc-1/toggle')
    })
    await waitFor(() => {
      expect(mockFetchMe).toHaveBeenCalled()
    })
  })

  it('shows error message when toggleAccount fails', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Network error'))
    renderSettings()

    const disableBtn = screen.getByText('settings.disableSync')
    fireEvent.click(disableBtn)

    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-primary')
      expect(okBtn).toBeInTheDocument()
    })

    const confirmBtn = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement
    fireEvent.click(confirmBtn)

    // toggleAccount catches the error and calls message.error
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/auth/gmail/acc-1/toggle')
    })
  })

  it('renders user profile section', () => {
    renderSettings()
    expect(screen.getByText('settings.profile')).toBeInTheDocument()
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
  })
})
