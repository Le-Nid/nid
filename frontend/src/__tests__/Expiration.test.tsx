import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

const mockExpirations = vi.fn()
const mockStats = vi.fn()
const mockDelete = vi.fn()
const mockCreate = vi.fn()
const mockDetect = vi.fn()
const mockBatch = vi.fn()

vi.mock('../hooks/queries', () => ({
  useExpirations: (...args: any[]) => mockExpirations(...args),
  useExpirationStats: (...args: any[]) => mockStats(...args),
  useDeleteExpiration: (...args: any[]) => mockDelete(...args),
  useCreateExpiration: (...args: any[]) => mockCreate(...args),
  useDetectExpirations: (...args: any[]) => mockDetect(...args),
  useCreateExpirationBatch: (...args: any[]) => mockBatch(...args),
}))

vi.mock('../api', () => ({
  gmailApi: {
    listMessages: vi.fn().mockResolvedValue({ messages: [] }),
    batchGetMessages: vi.fn().mockResolvedValue([]),
  },
}))

import ExpirationPage from '../pages/Expiration'

describe('ExpirationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReturnValue({ mutateAsync: vi.fn() })
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    mockDetect.mockReturnValue({ mutateAsync: vi.fn() })
    mockBatch.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  })

  it('renders title and stats', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({
      data: { total: 10, pending: 5, deleted: 3, expiringSoon: 2 },
    })

    render(<ExpirationPage />)
    expect(screen.getByText('expiration.title')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: true })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    expect(screen.getByText('expiration.title')).toBeInTheDocument()
  })

  it('renders expirations in table', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-1',
          subject: 'Your OTP code',
          sender: 'noreply@google.com',
          category: 'otp',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 1, pending: 1, deleted: 0, expiringSoon: 0 } })

    render(<ExpirationPage />)
    expect(screen.getByText('Your OTP code')).toBeInTheDocument()
    expect(screen.getByText('expiration.cat_otp')).toBeInTheDocument()
  })
})
