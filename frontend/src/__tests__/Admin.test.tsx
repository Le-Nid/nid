import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

const mockAdminStats = vi.fn()
const mockAdminUsers = vi.fn()
const mockAdminJobs = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockUpdateAdminUser = vi.fn()

vi.mock('../hooks/queries', () => ({
  useAdminStats: (...args: any[]) => mockAdminStats(...args),
  useAdminUsers: (...args: any[]) => mockAdminUsers(...args),
  useAdminJobs: (...args: any[]) => mockAdminJobs(...args),
  useUpdateAdminUser: () => mockUpdateAdminUser(),
}))

import AdminPage from '../pages/Admin'

const fullStats = {
  users: 5,
  gmailAccounts: 3,
  jobs: { total: 10, active: 2 },
  archives: { totalMails: 1000, totalSizeBytes: 1024 * 1024 },
}

const sampleUser = {
  id: 'u1',
  email: 'alice@test.com',
  role: 'user',
  display_name: 'Alice',
  avatar_url: null,
  is_active: true,
  max_gmail_accounts: 5,
  storage_quota_bytes: 5 * 1073741824,
  last_login_at: '2026-03-30T10:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  gmail_accounts_count: 2,
  storage_used_bytes: 1073741824,
}

const adminUser = {
  ...sampleUser,
  id: 'u2',
  email: 'admin@test.com',
  role: 'admin',
  display_name: null,
  avatar_url: 'https://example.com/avatar.png',
  is_active: false,
  last_login_at: null,
}

const sampleJob = {
  id: 'j1',
  type: 'archive_mails',
  status: 'completed',
  progress: 100,
  total: 50,
  processed: 50,
  user_id: 'u1',
  user_email: 'alice@test.com',
  error: null,
  created_at: '2026-03-30T10:00:00.000Z',
  completed_at: '2026-03-30T10:05:00.000Z',
}

const failedJob = {
  ...sampleJob,
  id: 'j2',
  status: 'failed',
  error: 'Timeout exceeded',
  progress: 50,
  processed: 25,
  completed_at: null,
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMutateAsync.mockResolvedValue({})
    mockUpdateAdminUser.mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false })
  })

  it('shows title', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('admin.title')).toBeInTheDocument()
  })

  it('displays all stat cards', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('5')).toBeInTheDocument() // users
    expect(screen.getByText('3')).toBeInTheDocument() // gmailAccounts
    expect(screen.getByText('10')).toBeInTheDocument() // total jobs
  })

  it('shows loading state without stats', () => {
    mockAdminStats.mockReturnValue({ data: null, isLoading: true })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: true })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: true })

    render(<AdminPage />)
    expect(screen.getByText('admin.title')).toBeInTheDocument()
  })

  it('displays users table with data', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser, adminUser], total: 2 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    // Role tags
    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('displays jobs table when jobs tab is clicked', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({
      data: { jobs: [sampleJob, failedJob], total: 2 },
      isLoading: false,
    })

    render(<AdminPage />)
    // Click Jobs tab
    fireEvent.click(screen.getByRole('tab', { name: /Jobs/i }))

    await waitFor(() => {
      expect(screen.getAllByText('archive_mails').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Timeout exceeded')).toBeInTheDocument()
    })
  })

  it('opens edit user modal when edit button clicked', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    
    const editButtons = screen.getAllByText('common.edit')
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByText('admin.editUser')).toBeInTheDocument()
    })
  })

  it('shows user details in edit modal', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    fireEvent.click(screen.getByText('common.edit'))

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })

  it('shows is_active badge status', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser, adminUser], total: 2 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('common.yes')).toBeInTheDocument()
    expect(screen.getByText('common.no')).toBeInTheDocument()
  })

  it('shows gmail accounts count with max', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('shows user with avatar', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [adminUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    // Avatar should be an img element
    expect(document.querySelector('img[src="https://example.com/avatar.png"]')).toBeInTheDocument()
  })

  it('shows search input for users', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByPlaceholderText('admin.searchPlaceholder')).toBeInTheDocument()
  })

  it('shows user storage used', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    // Storage column renders "formatBytes(used) / formatBytes(quota)"
    expect(screen.getByText(/1.*Go.*5.*Go/i)).toBeTruthy()
  })

  it('shows last login date or dash', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser, adminUser], total: 2 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    // adminUser has null last_login_at → should show '—'
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows job progress format', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({
      data: { jobs: [sampleJob], total: 1 },
      isLoading: false,
    })

    render(<AdminPage />)
    fireEvent.click(screen.getByRole('tab', { name: /Jobs/i }))

    await waitFor(() => {
      expect(screen.getByText('50/50 (100%)')).toBeInTheDocument()
    })
  })

  it('shows failed job progress format', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({
      data: { jobs: [failedJob], total: 1 },
      isLoading: false,
    })

    render(<AdminPage />)
    fireEvent.click(screen.getByRole('tab', { name: /Jobs/i }))

    await waitFor(() => {
      expect(screen.getByText('25/50 (50%)')).toBeInTheDocument()
    })
  })

  it('saves user from edit modal', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    fireEvent.click(screen.getByText('common.edit'))

    await waitFor(() => {
      expect(screen.getByText('admin.editUser')).toBeInTheDocument()
    })

    // Click save button in modal
    const saveButtons = screen.getAllByText('common.save')
    fireEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        userId: 'u1',
        updates: {
          role: 'user',
          is_active: true,
          max_gmail_accounts: 5,
          storage_quota_bytes: 5 * 1073741824,
        },
      })
    })
  })

  it('shows edit form descriptions for user', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [sampleUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    fireEvent.click(screen.getByText('common.edit'))

    await waitFor(() => {
      expect(screen.getByText('admin.editUser')).toBeInTheDocument()
      // EditUserForm renders descriptions and form fields
      expect(screen.getByText('admin.email')).toBeInTheDocument()
      expect(screen.getByText('admin.registeredAt')).toBeInTheDocument()
      expect(screen.getByText('admin.storageUsed')).toBeInTheDocument()
    })
  })

  it('shows active jobs count in stats suffix', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    // The suffix text is inside a span, may be split across elements
    expect(screen.getByText('admin.totalJobs')).toBeInTheDocument()
  })

  it('shows archives stat', () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    expect(screen.getByText('admin.archives')).toBeInTheDocument()
  })

  it('shows job error or dash', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({ data: { users: [], total: 0 }, isLoading: false })
    mockAdminJobs.mockReturnValue({
      data: { jobs: [sampleJob, failedJob], total: 2 },
      isLoading: false,
    })

    render(<AdminPage />)
    fireEvent.click(screen.getByRole('tab', { name: /Jobs/i }))

    await waitFor(() => {
      // sampleJob has error: null → '—'
      // failedJob has error: 'Timeout exceeded'
      expect(screen.getByText('Timeout exceeded')).toBeInTheDocument()
    })
  })

  it('shows user with null display_name as dash in edit modal', async () => {
    mockAdminStats.mockReturnValue({ data: fullStats, isLoading: false })
    mockAdminUsers.mockReturnValue({
      data: { users: [adminUser], total: 1 },
      isLoading: false,
    })
    mockAdminJobs.mockReturnValue({ data: { jobs: [], total: 0 }, isLoading: false })

    render(<AdminPage />)
    fireEvent.click(screen.getByText('common.edit'))

    await waitFor(() => {
      // display_name is null → '—'
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    })
  })
})
