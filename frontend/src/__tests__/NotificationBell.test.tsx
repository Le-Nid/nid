import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NotificationBell from '../components/NotificationBell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}))

const mockNotificationsApi = {
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  remove: vi.fn(),
  removeAllRead: vi.fn(),
}

vi.mock('../api', () => ({
  notificationsApi: {
    list: (...args: any[]) => mockNotificationsApi.list(...args),
    markRead: (...args: any[]) => mockNotificationsApi.markRead(...args),
    markAllRead: (...args: any[]) => mockNotificationsApi.markAllRead(...args),
    remove: (...args: any[]) => mockNotificationsApi.remove(...args),
    removeAllRead: (...args: any[]) => mockNotificationsApi.removeAllRead(...args),
  },
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationsApi.list.mockResolvedValue({ notifications: [], unreadCount: 0 })
  })

  it('renders bell icon', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalledWith({ limit: 10 }))
    expect(document.querySelector('.lucide-bell')).toBeInTheDocument()
  })

  it('shows badge with unread count', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Test', body: null, is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 1,
    })

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('loads notifications on mount', async () => {
    render(<NotificationBell />)
    await waitFor(() => {
      expect(mockNotificationsApi.list).toHaveBeenCalledWith({ limit: 10 })
    })
  })

  it('handles load failure silently', async () => {
    mockNotificationsApi.list.mockRejectedValueOnce(new Error('fail'))
    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())
  })

  it('shows notifications dropdown on click', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Notification 1', body: 'body text', is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
        { id: 'n2', type: 'info', title: 'Notification 2', body: null, is_read: true, created_at: '2026-03-29T10:00:00.000Z' },
      ],
      unreadCount: 1,
    })

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    // Click bell to open dropdown
    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => {
      expect(screen.getByText('Notification 1')).toBeInTheDocument()
      expect(screen.getByText('Notification 2')).toBeInTheDocument()
      expect(screen.getByText('body text')).toBeInTheDocument()
    })
  })

  it('marks notification as read on click', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Unread notif', body: null, is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 1,
    })
    mockNotificationsApi.markRead.mockResolvedValue({})

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => expect(screen.getByText('Unread notif')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Unread notif'))

    await waitFor(() => {
      expect(mockNotificationsApi.markRead).toHaveBeenCalledWith('n1')
    })
  })

  it('shows mark all read button when unread exist', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Notif', body: null, is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 1,
    })

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => {
      expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument()
    })
  })

  it('shows empty state when no notifications', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => {
      expect(screen.getByText('notifications.empty')).toBeInTheDocument()
    })
  })

  it('deletes notification', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'To delete', body: null, is_read: true, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 0,
    })
    mockNotificationsApi.remove.mockResolvedValue({})

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => expect(screen.getByText('To delete')).toBeInTheDocument())

    // Click delete button
    const deleteBtn = screen.getByLabelText('common.delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockNotificationsApi.remove).toHaveBeenCalledWith('n1')
    })
  })

  it('marks all as read', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Unread 1', body: null, is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
        { id: 'n2', type: 'info', title: 'Unread 2', body: null, is_read: false, created_at: '2026-03-29T10:00:00.000Z' },
      ],
      unreadCount: 2,
    })
    mockNotificationsApi.markAllRead.mockResolvedValue({})

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument())

    fireEvent.click(screen.getByText('notifications.markAllRead'))

    await waitFor(() => {
      expect(mockNotificationsApi.markAllRead).toHaveBeenCalled()
    })
  })

  it('deletes unread notification and decrements count', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Unread to delete', body: null, is_read: false, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 1,
    })
    mockNotificationsApi.remove.mockResolvedValue({})

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => expect(screen.getByText('Unread to delete')).toBeInTheDocument())

    const deleteBtn = screen.getByLabelText('common.delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockNotificationsApi.remove).toHaveBeenCalledWith('n1')
    })
  })

  it('shows clear read button when read notifications exist', async () => {
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [
        { id: 'n1', type: 'info', title: 'Read notif', body: null, is_read: true, created_at: '2026-03-30T10:00:00.000Z' },
      ],
      unreadCount: 0,
    })

    render(<NotificationBell />)
    await waitFor(() => expect(mockNotificationsApi.list).toHaveBeenCalled())

    fireEvent.click(document.querySelector('.lucide-bell')!)

    await waitFor(() => {
      expect(screen.getByText('notifications.clearRead')).toBeInTheDocument()
    })
  })
})
