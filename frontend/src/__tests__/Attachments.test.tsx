import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

const mockArchivedAttachments = vi.fn()
const mockLiveAttachments = vi.fn()

vi.mock('../hooks/queries', () => ({
  useArchivedAttachments: (...args: any[]) => mockArchivedAttachments(...args),
  useLiveAttachments: (...args: any[]) => mockLiveAttachments(...args),
}))

import AttachmentsPage from '../pages/Attachments'

const archivedAtts = [
  {
    id: 'att-1',
    filename: 'document.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1024 * 500,
    mail_subject: 'Important doc',
    mail_sender: 'bob@test.com',
    mail_date: '2026-03-30T10:00:00.000Z',
  },
  {
    id: 'att-2',
    filename: 'photo.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024 * 1024 * 2,
    mail_subject: null,
    mail_sender: 'alice@test.com',
    mail_date: null,
  },
  {
    id: 'att-3',
    filename: 'archive.zip',
    mime_type: 'application/zip',
    size_bytes: 1024 * 1024 * 10,
    mail_subject: 'Backup files',
    mail_sender: 'sys@test.com',
    mail_date: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'att-4',
    filename: 'unknown.dat',
    mime_type: null,
    size_bytes: 512,
    mail_subject: 'Mystery',
    mail_sender: 'x@test.com',
    mail_date: '2026-02-01T10:00:00.000Z',
  },
]

const liveAtts = [
  {
    messageId: 'msg-1',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024 * 300,
    mailSubject: 'Q4 Report',
    mailSender: 'finance@test.com',
    mailDate: '2026-03-29T10:00:00.000Z',
    mailSizeEstimate: 1024 * 400,
  },
]

describe('AttachmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLiveAttachments.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
  })

  it('shows title', () => {
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<AttachmentsPage />)
    expect(screen.getByText('attachments.title')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockArchivedAttachments.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() })
    render(<AttachmentsPage />)
    expect(screen.getByText('attachments.title')).toBeInTheDocument()
  })

  it('displays archived attachments with different file types', () => {
    mockArchivedAttachments.mockReturnValue({
      data: {
        attachments: archivedAtts,
        total: 4,
        totalSizeBytes: 1024 * 1024 * 12,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    expect(screen.getByText('document.pdf')).toBeInTheDocument()
    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    expect(screen.getByText('archive.zip')).toBeInTheDocument()
    expect(screen.getByText('unknown.dat')).toBeInTheDocument()
    // Shows noSubject for null subject
    expect(screen.getByText('common.noSubject')).toBeInTheDocument()
  })

  it('shows stats cards', () => {
    mockArchivedAttachments.mockReturnValue({
      data: {
        attachments: archivedAtts,
        total: 4,
        totalSizeBytes: 1024 * 1024 * 12,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('attachments.sourceArchived')).toBeInTheDocument()
  })

  it('switches to live mode', () => {
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockLiveAttachments.mockReturnValue({
      data: {
        attachments: liveAtts,
        totalSizeBytes: 1024 * 300,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    // Switch to live
    fireEvent.click(screen.getByText('attachments.live'))

    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('Q4 Report')).toBeInTheDocument()
    expect(screen.getByText('attachments.sourceLive')).toBeInTheDocument()
  })

  it('shows empty state when no attachments', () => {
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    expect(screen.getByText('attachments.noAttachment')).toBeInTheDocument()
  })

  it('shows search input in archived mode', () => {
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    expect(screen.getByPlaceholderText('attachments.searchPlaceholder')).toBeInTheDocument()
  })

  it('calls refetch on reload', () => {
    const refetch = vi.fn()
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch,
    })

    render(<AttachmentsPage />)
    fireEvent.click(screen.getByText('attachments.reload'))

    expect(refetch).toHaveBeenCalled()
  })

  it('shows mode segmented control', () => {
    mockArchivedAttachments.mockReturnValue({
      data: { attachments: [], total: 0, totalSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AttachmentsPage />)
    expect(screen.getByText('attachments.archived')).toBeInTheDocument()
    expect(screen.getByText('attachments.live')).toBeInTheDocument()
  })
})
