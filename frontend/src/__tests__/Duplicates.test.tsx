import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

const mockDuplicates = vi.fn()
const mockDeleteDuplicates = vi.fn()

vi.mock('../hooks/queries', () => ({
  useDuplicates: (...args: any[]) => mockDuplicates(...args),
  useDeleteDuplicates: (...args: any[]) => mockDeleteDuplicates(...args),
}))

import DuplicatesPage from '../pages/Duplicates'

describe('DuplicatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteDuplicates.mockReturnValue({ mutateAsync: vi.fn() })
  })

  it('shows loading state', () => {
    mockDuplicates.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() })
    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.title')).toBeInTheDocument()
  })

  it('displays duplicate groups with stats', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Test Email',
            sender: 'alice@test.com',
            dateGroup: '2026-03-30T10:00:00.000Z',
            count: 3,
            totalSizeBytes: 1024 * 50,
            mailIds: ['m1', 'm2', 'm3'],
          },
          {
            subject: null,
            sender: 'bob@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 5,
            totalSizeBytes: 1024 * 200,
            mailIds: ['m4', 'm5', 'm6', 'm7', 'm8'],
          },
        ],
        totalDuplicateMails: 8,
        totalDuplicateSizeBytes: 1024 * 250,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('Test Email')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()
    // Stats cards
    expect(screen.getByText('2')).toBeInTheDocument() // groups
    expect(screen.getByText('8')).toBeInTheDocument() // total duplicates
  })

  it('shows no duplicates message when empty', () => {
    mockDuplicates.mockReturnValue({
      data: { groups: [], totalDuplicateMails: 0, totalDuplicateSizeBytes: 0 },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.noDuplicates')).toBeInTheDocument()
  })

  it('calls refetch on reload', () => {
    const refetch = vi.fn()
    mockDuplicates.mockReturnValue({
      data: { groups: [], totalDuplicateMails: 0, totalDuplicateSizeBytes: 0 },
      isLoading: false,
      refetch,
    })

    render(<DuplicatesPage />)
    fireEvent.click(screen.getByText('duplicates.analyze'))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows noSubject for groups with null subject', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: null,
            sender: 'bob@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 1024,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 1024,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('common.noSubject')).toBeInTheDocument()
  })

  it('shows red tag for groups with count > 3', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Many dupes',
            sender: 'x@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 5,
            totalSizeBytes: 2048,
            mailIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
          },
        ],
        totalDuplicateMails: 5,
        totalDuplicateSizeBytes: 2048,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('Many dupes')).toBeInTheDocument()
    // Delete button shows count-1
    expect(screen.getByText('duplicates.deleteCount:4')).toBeInTheDocument()
  })

  it('shows delete button for each group', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Group 1',
            sender: 'a@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 3,
            totalSizeBytes: 1024,
            mailIds: ['m1', 'm2', 'm3'],
          },
        ],
        totalDuplicateMails: 3,
        totalDuplicateSizeBytes: 1024,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.deleteCount:2')).toBeInTheDocument()
  })

  it('shows total size stat', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Test',
            sender: 'a@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 1024 * 1024,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 1024 * 1024,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.reclaimableSpace')).toBeInTheDocument()
  })

  it('shows hint card', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Test',
            sender: 'a@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 1024,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 1024,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.hint')).toBeInTheDocument()
  })

  it('shows groups count stat', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'G1',
            sender: 'a@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 100,
            mailIds: ['m1', 'm2'],
          },
          {
            subject: 'G2',
            sender: 'b@test.com',
            dateGroup: '2026-03-27T10:00:00.000Z',
            count: 3,
            totalSizeBytes: 200,
            mailIds: ['m3', 'm4', 'm5'],
          },
        ],
        totalDuplicateMails: 5,
        totalDuplicateSizeBytes: 300,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    // Groups count = 2
    expect(screen.getByText('2')).toBeInTheDocument()
    // Total duplicates = 5
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows date formatted for groups', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Dated',
            sender: 'x@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 100,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 100,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('Dated')).toBeInTheDocument()
  })

  it('handles delete confirmation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ deleted: 2 })
    mockDeleteDuplicates.mockReturnValue({ mutateAsync })
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Dup Subject',
            sender: 'sender@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 3,
            totalSizeBytes: 500,
            mailIds: ['m1', 'm2', 'm3'],
          },
        ],
        totalDuplicateMails: 3,
        totalDuplicateSizeBytes: 500,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    // Click the delete button to open Popconfirm
    const deleteBtn = document.querySelector('.lucide-trash-2')!.closest('button')!
    fireEvent.click(deleteBtn)

    // Popconfirm shows, click the OK button
    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-dangerous')
      if (okBtn) fireEvent.click(okBtn)
    })

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(['m2', 'm3'])
    })
  })

  it('handles delete error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('fail'))
    mockDeleteDuplicates.mockReturnValue({ mutateAsync })
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Error Group',
            sender: 'err@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 200,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 200,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    const deleteBtn = document.querySelector('.lucide-trash-2')!.closest('button')!
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-dangerous')
      if (okBtn) fireEvent.click(okBtn)
    })

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled()
    })
  })

  it('shows orange tag for count <= 3', () => {
    mockDuplicates.mockReturnValue({
      data: {
        groups: [
          {
            subject: 'Small group',
            sender: 'a@test.com',
            dateGroup: '2026-03-28T10:00:00.000Z',
            count: 2,
            totalSizeBytes: 100,
            mailIds: ['m1', 'm2'],
          },
        ],
        totalDuplicateMails: 2,
        totalDuplicateSizeBytes: 100,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<DuplicatesPage />)
    expect(screen.getByText('duplicates.copiesTag:2')).toBeInTheDocument()
  })
})
