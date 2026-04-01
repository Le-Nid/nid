import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key,
    i18n: { language: 'fr' },
  }),
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

const mockTrackingStats = vi.fn()
const mockTrackedMessages = vi.fn()
const mockPiiStats = vi.fn()
const mockPiiFindings = vi.fn()
const mockEncryptionStatus = vi.fn()

vi.mock('../hooks/queries', () => ({
  useTrackingStats: (...args: any[]) => mockTrackingStats(...args),
  useTrackedMessages: (...args: any[]) => mockTrackedMessages(...args),
  usePiiStats: (...args: any[]) => mockPiiStats(...args),
  usePiiFindings: (...args: any[]) => mockPiiFindings(...args),
  useEncryptionStatus: (...args: any[]) => mockEncryptionStatus(...args),
}))

vi.mock('../components/JobProgressModal', () => ({
  default: () => null,
}))

const mockPrivacyApi = vi.hoisted(() => ({
  scanTracking: vi.fn(),
  scanPii: vi.fn(),
  setupEncryption: vi.fn(),
  verifyEncryption: vi.fn(),
  encryptArchives: vi.fn(),
  decryptMail: vi.fn(),
}))

vi.mock('../api', () => ({
  privacyApi: mockPrivacyApi,
}))

import PrivacyPage from '../pages/Privacy'

describe('PrivacyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackingStats.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
    mockTrackedMessages.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
    mockPiiStats.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
    mockPiiFindings.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
    mockEncryptionStatus.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
  })

  it('shows title', () => {
    render(<PrivacyPage />)
    expect(screen.getByText('privacy.title')).toBeInTheDocument()
  })

  it('renders all tabs', () => {
    render(<PrivacyPage />)
    expect(screen.getByText('privacy.tracking.tab')).toBeInTheDocument()
    expect(screen.getByText('privacy.pii.tab')).toBeInTheDocument()
    expect(screen.getByText('privacy.encryption.tab')).toBeInTheDocument()
  })

  // ─── Tracking Tab ─────────────────────────────────────

  it('shows tracking stats', () => {
    mockTrackingStats.mockReturnValue({
      data: { trackedMessages: 42, totalTrackers: 120, topDomains: [{ domain: 'doubleclick.net', count: 50 }] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockTrackedMessages.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('doubleclick.net')).toBeInTheDocument()
  })

  it('shows tracked messages table', () => {
    mockTrackingStats.mockReturnValue({
      data: { trackedMessages: 1, totalTrackers: 2, topDomains: [] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockTrackedMessages.mockReturnValue({
      data: {
        items: [{
          id: 'tm1',
          sender: 'news@corp.com',
          subject: 'Newsletter',
          date: '2026-03-30T10:00:00.000Z',
          tracker_count: 3,
          trackers: [{ type: 'pixel', domain: 'tracker.com' }, { type: 'utm', domain: 'analytics.com' }],
        }],
        total: 1,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    expect(screen.getByText('news@corp.com')).toBeInTheDocument()
    expect(screen.getByText('Newsletter')).toBeInTheDocument()
  })

  it('handles tracking scan', async () => {
    mockPrivacyApi.scanTracking.mockResolvedValue({ jobId: 'job-1' })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.tracking.scan'))

    await waitFor(() => {
      expect(mockPrivacyApi.scanTracking).toHaveBeenCalledWith('acc-1')
    })
  })

  it('handles tracking scan error', async () => {
    mockPrivacyApi.scanTracking.mockRejectedValue(new Error('fail'))

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.tracking.scan'))

    await waitFor(() => {
      expect(mockPrivacyApi.scanTracking).toHaveBeenCalled()
    })
  })

  it('calls refetch on refresh tracking', () => {
    const refetchStats = vi.fn()
    const refetchMessages = vi.fn()
    mockTrackingStats.mockReturnValue({ data: null, isLoading: false, refetch: refetchStats })
    mockTrackedMessages.mockReturnValue({ data: null, isLoading: false, refetch: refetchMessages })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('common.refresh'))

    expect(refetchStats).toHaveBeenCalled()
    expect(refetchMessages).toHaveBeenCalled()
  })

  it('shows top domains card when available', () => {
    mockTrackingStats.mockReturnValue({
      data: {
        trackedMessages: 5,
        totalTrackers: 10,
        topDomains: [
          { domain: 'tracker1.com', count: 30 },
          { domain: 'tracker2.com', count: 20 },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockTrackedMessages.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, refetch: vi.fn() })

    render(<PrivacyPage />)
    expect(screen.getByText('privacy.tracking.topDomains')).toBeInTheDocument()
    expect(screen.getAllByText(/tracker1\.com/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/tracker2\.com/).length).toBeGreaterThanOrEqual(1)
  })

  // ─── PII Tab ───────────────────────────────────────────

  it('shows PII stats and alert when findings exist', () => {
    mockPiiStats.mockReturnValue({
      data: { totalFindings: 15, affectedMails: 8, byType: [{ type: 'email', count: 10 }] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockPiiFindings.mockReturnValue({
      data: {
        items: [{
          id: 'f1',
          sender: 'hr@company.com',
          subject: 'Payroll',
          pii_type: 'email',
          count: 3,
          snippet: 'john@example.com found in body...',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    // Switch to PII tab
    fireEvent.click(screen.getByText('privacy.pii.tab'))

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('privacy.pii.alertTitle')).toBeInTheDocument()
  })

  it('shows PII findings table', () => {
    mockPiiStats.mockReturnValue({
      data: { totalFindings: 1, affectedMails: 1, byType: [] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockPiiFindings.mockReturnValue({
      data: {
        items: [{
          id: 'f1',
          sender: 'someone@test.com',
          subject: 'Contract',
          pii_type: 'phone',
          count: 2,
          snippet: '+33 6 12 34 56 78',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.pii.tab'))

    expect(screen.getByText('someone@test.com')).toBeInTheDocument()
    expect(screen.getByText('Contract')).toBeInTheDocument()
  })

  it('handles PII scan', async () => {
    mockPrivacyApi.scanPii.mockResolvedValue({ jobId: 'job-2' })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.pii.tab'))
    fireEvent.click(screen.getByText('privacy.pii.scan'))

    await waitFor(() => {
      expect(mockPrivacyApi.scanPii).toHaveBeenCalledWith('acc-1')
    })
  })

  it('handles PII scan error', async () => {
    mockPrivacyApi.scanPii.mockRejectedValue(new Error('fail'))

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.pii.tab'))
    fireEvent.click(screen.getByText('privacy.pii.scan'))

    await waitFor(() => {
      expect(mockPrivacyApi.scanPii).toHaveBeenCalled()
    })
  })

  // ─── Encryption Tab ───────────────────────────────────

  it('shows encryption status with key', () => {
    mockEncryptionStatus.mockReturnValue({
      data: {
        hasEncryptionKey: true,
        total: 100,
        encrypted: 80,
        unencrypted: 20,
        percentage: 80,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('privacy.encryption.encryptTitle')).toBeInTheDocument()
  })

  it('shows setup form when no encryption key', () => {
    mockEncryptionStatus.mockReturnValue({
      data: {
        hasEncryptionKey: false,
        total: 50,
        encrypted: 0,
        unencrypted: 50,
        percentage: 0,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    expect(screen.getByText('privacy.encryption.setupTitle')).toBeInTheDocument()
  })

  it('shows all encrypted message when unencrypted is 0', () => {
    mockEncryptionStatus.mockReturnValue({
      data: {
        hasEncryptionKey: true,
        total: 50,
        encrypted: 50,
        unencrypted: 0,
        percentage: 100,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    expect(screen.getByText('privacy.encryption.allEncrypted')).toBeInTheDocument()
  })

  it('shows loading spinner for encryption tab', () => {
    mockEncryptionStatus.mockReturnValue({
      data: null,
      isLoading: true,
      refetch: vi.fn(),
    })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    expect(document.querySelector('.ant-spin')).toBeInTheDocument()
  })

  it('handles encryption setup', async () => {
    mockEncryptionStatus.mockReturnValue({
      data: { hasEncryptionKey: false, total: 10, encrypted: 0, unencrypted: 10, percentage: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockPrivacyApi.setupEncryption.mockResolvedValue({})

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    const input = screen.getByPlaceholderText('privacy.encryption.passphrasePlaceholder')
    fireEvent.change(input, { target: { value: 'a-strong-passphrase-here' } })
    fireEvent.click(screen.getByText('privacy.encryption.setup'))

    await waitFor(() => {
      expect(mockPrivacyApi.setupEncryption).toHaveBeenCalledWith('a-strong-passphrase-here')
    })
  })

  it('handles encrypt archives flow', async () => {
    mockEncryptionStatus.mockReturnValue({
      data: { hasEncryptionKey: true, total: 10, encrypted: 5, unencrypted: 5, percentage: 50 },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockPrivacyApi.verifyEncryption.mockResolvedValue({ valid: true })
    mockPrivacyApi.encryptArchives.mockResolvedValue({ jobId: 'enc-job-1' })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    const input = screen.getByPlaceholderText('privacy.encryption.passphrasePlaceholder')
    fireEvent.change(input, { target: { value: 'my-passphrase' } })
    fireEvent.click(screen.getByText('privacy.encryption.encrypt'))

    await waitFor(() => {
      expect(mockPrivacyApi.verifyEncryption).toHaveBeenCalledWith('my-passphrase')
      expect(mockPrivacyApi.encryptArchives).toHaveBeenCalledWith('acc-1', 'my-passphrase')
    })
  })

  it('shows error on invalid passphrase during encrypt', async () => {
    mockEncryptionStatus.mockReturnValue({
      data: { hasEncryptionKey: true, total: 10, encrypted: 5, unencrypted: 5, percentage: 50 },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockPrivacyApi.verifyEncryption.mockResolvedValue({ valid: false })

    render(<PrivacyPage />)
    fireEvent.click(screen.getByText('privacy.encryption.tab'))

    const input = screen.getByPlaceholderText('privacy.encryption.passphrasePlaceholder')
    fireEvent.change(input, { target: { value: 'wrong-passphrase' } })
    fireEvent.click(screen.getByText('privacy.encryption.encrypt'))

    await waitFor(() => {
      expect(mockPrivacyApi.verifyEncryption).toHaveBeenCalled()
      expect(mockPrivacyApi.encryptArchives).not.toHaveBeenCalled()
    })
  })
})
