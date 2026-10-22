import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import NotificationBell from '../components/app/NotificationBell'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  remove: vi.fn(),
  removeAllRead: vi.fn(),
}))
vi.mock('../api', () => ({ notificationsApi: api }))
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const notif = (id: string, title: string, is_read: boolean, body: string | null = null) =>
  ({ id, type: 'info', title, body, is_read, created_at: '2026-03-30T10:00:00.000Z' })

function setup(notifications: ReturnType<typeof notif>[]) {
  api.list.mockResolvedValue({ notifications, unreadCount: notifications.filter((n) => !n.is_read).length })
  render(<NotificationBell />)
}

async function open(name: RegExp | string = 'Notifications') {
  await userEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

beforeAll(() => i18n.changeLanguage('fr'))

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of [api.markRead, api.markAllRead, api.remove, api.removeAllRead]) fn.mockResolvedValue({})
})

describe('NotificationBell', () => {
  it('loads the 10 latest and names the bell with the unread count', async () => {
    setup([notif('n1', 'Test', false), notif('n2', 'Old', true)])
    expect(await screen.findByRole('button', { name: 'Notifications, 1 non lue' })).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledWith({ limit: 10 })
  })

  it('ignores a load failure', async () => {
    api.list.mockRejectedValueOnce(new Error('fail'))
    render(<NotificationBell />)
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('shows the list in a popover, empty state included', async () => {
    setup([])
    expect(await open()).toHaveTextContent('Aucune notification')
  })

  it('marks an unread notification read on click and lowers the count', async () => {
    setup([notif('n1', 'Unread notif', false, 'body text'), notif('n2', 'Read notif', true)])
    const panel = await open(/1 non lue/)
    expect(within(panel).getByText('body text')).toBeInTheDocument()
    // A read notification is plain text, not a button
    expect(within(panel).queryByRole('button', { name: /^Read notif/ })).toBeNull()

    await userEvent.click(within(panel).getByRole('button', { name: /^Unread notif/ }))
    expect(api.markRead).toHaveBeenCalledWith('n1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument())
  })

  it('marks all read', async () => {
    setup([notif('n1', 'Unread 1', false), notif('n2', 'Unread 2', false)])
    const panel = await open(/2 non lues/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Tout marquer lu' }))
    expect(api.markAllRead).toHaveBeenCalled()
    expect(within(panel).queryByRole('button', { name: 'Tout marquer lu' })).toBeNull()
  })

  it('says so when an action fails and keeps the list as it was', async () => {
    api.markAllRead.mockRejectedValueOnce(new Error('fail'))
    setup([notif('n1', 'Unread 1', false)])
    const panel = await open(/1 non lue/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Tout marquer lu' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("L'action n'a pas abouti. Réessayez."))
    expect(within(panel).getByRole('button', { name: 'Tout marquer lu' })).toBeInTheDocument()
  })

  it('deletes one notification', async () => {
    setup([notif('n1', 'To delete', false)])
    const panel = await open(/1 non lue/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Supprimer la notification « To delete »' }))
    expect(api.remove).toHaveBeenCalledWith('n1')
    await waitFor(() => expect(within(panel).queryByText('To delete')).toBeNull())
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('clears read notifications after confirmation', async () => {
    setup([notif('n1', 'Read 1', true), notif('n2', 'Unread 1', false)])
    const panel = await open(/1 non lue/)
    await userEvent.click(within(panel).getByRole('button', { name: 'Supprimer lues' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer toutes les notifications lues ?' })
    expect(api.removeAllRead).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer lues' }))
    expect(api.removeAllRead).toHaveBeenCalled()
  })
})
