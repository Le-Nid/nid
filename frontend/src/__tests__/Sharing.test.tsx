import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockShares = vi.fn()
const mockCreate = vi.fn()
const mockRevoke = vi.fn()

vi.mock('../hooks/queries', () => ({
  useShares: (...args: any[]) => mockShares(...args),
  useCreateShare: (...args: any[]) => mockCreate(...args),
  useRevokeShare: (...args: any[]) => mockRevoke(...args),
}))

import SharingPage from '../pages/Sharing'

describe('SharingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    mockRevoke.mockReturnValue({ mutateAsync: vi.fn() })
  })

  it('renders title and description', () => {
    mockShares.mockReturnValue({ data: [], isLoading: false })
    render(<SharingPage />)
    expect(screen.getByText('sharing.title')).toBeInTheDocument()
    expect(screen.getByText('sharing.description')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockShares.mockReturnValue({ data: [], isLoading: true })
    render(<SharingPage />)
    expect(screen.getByText('sharing.title')).toBeInTheDocument()
  })

  it('renders shares in table', () => {
    mockShares.mockReturnValue({
      data: [
        {
          id: 'share-1',
          token: 'abc123def456',
          subject: 'Shared email',
          sender: 'alice@test.com',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          access_count: 3,
          max_access: 10,
          created_at: new Date().toISOString(),
        },
      ],
      isLoading: false,
    })

    render(<SharingPage />)
    expect(screen.getByText('Shared email')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    mockShares.mockReturnValue({ data: [], isLoading: false })
    render(<SharingPage />)
    expect(screen.getByText('sharing.noShares')).toBeInTheDocument()
  })
})
