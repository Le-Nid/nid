import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '../i18n'
import { accountSharesApi } from '../api'
import { useAuthStore } from '../store/auth.store'

vi.mock('../api', () => ({ accountSharesApi: { list: vi.fn(), add: vi.fn(), remove: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AccountSharesBlock, SharedWithMe } from '../pages/settings/AccountShares'

const ACCOUNT = { id: 'acc-1', email: 'box@gmail.com', is_active: true }
const SHARE = { user_id: 'u2', email: 'ami@example.com', display_name: 'Ami', created_at: '2026-10-31' }
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
const httpError = (status: number) => Object.assign(new Error('x'), { response: { status } })

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(accountSharesApi.list).mockResolvedValue([SHARE])
  vi.mocked(accountSharesApi.add).mockResolvedValue({ ...SHARE, user_id: 'u3', email: 'bob@example.com', display_name: null })
  vi.mocked(accountSharesApi.remove).mockResolvedValue(undefined)
})

describe('AccountSharesBlock', () => {
  it('lists who has access, shares by email, revokes', async () => {
    const user = userEvent.setup()
    wrap(<AccountSharesBlock account={ACCOUNT} />)
    const list = await screen.findByRole('list', { name: 'Personnes ayant accès' })
    expect(within(list).getByText('Ami · ami@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Partager' })).toBeDisabled()

    await user.type(screen.getByLabelText('Adresse e-mail du compte Nid'), ' bob@example.com ')
    await user.click(screen.getByRole('button', { name: 'Partager' }))
    await waitFor(() => expect(accountSharesApi.add).toHaveBeenCalledWith('acc-1', 'bob@example.com'))
    expect(toast.success).toHaveBeenCalledWith('Archives partagées avec bob@example.com')
    expect(screen.getByLabelText('Adresse e-mail du compte Nid')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: "Retirer l'accès de ami@example.com" }))
    await waitFor(() => expect(accountSharesApi.remove).toHaveBeenCalledWith('acc-1', 'u2'))
    expect(toast.success).toHaveBeenCalledWith('Accès retiré à ami@example.com')
  })

  it.each([
    [404, "Aucun compte Nid actif n'utilise cette adresse."],
    [400, 'Ce compte est déjà le vôtre.'],
    [409, 'Déjà partagé avec cette personne.'],
  ])('an add refused with %i says why', async (status, message) => {
    const user = userEvent.setup()
    vi.mocked(accountSharesApi.add).mockRejectedValueOnce(httpError(status))
    wrap(<AccountSharesBlock account={ACCOUNT} />)
    await user.type(screen.getByLabelText('Adresse e-mail du compte Nid'), 'x@example.com{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
  })

  it('a failed revoke is reported', async () => {
    const user = userEvent.setup()
    vi.mocked(accountSharesApi.remove).mockRejectedValueOnce(new Error('x'))
    wrap(<AccountSharesBlock account={ACCOUNT} />)
    await user.click(await screen.findByRole('button', { name: "Retirer l'accès de ami@example.com" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})

describe('SharedWithMe', () => {
  it('lists the accounts shared with me; « Ne plus voir » leaves one', async () => {
    const user = userEvent.setup()
    const fetchMe = vi.fn()
    useAuthStore.setState({
      user: { id: 'me', email: 'me@example.com', role: 'user' },
      sharedAccounts: [{ id: 'sh1', email: 'box@gmail.com', is_active: true, shared_by: 'ana@example.com' }],
      fetchMe,
    })
    wrap(<SharedWithMe />)
    expect(screen.getByText('box@gmail.com (partagé par ana@example.com)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ne plus voir' }))
    await waitFor(() => expect(accountSharesApi.remove).toHaveBeenCalledWith('sh1', 'me'))
    await waitFor(() => expect(fetchMe).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('box@gmail.com retiré de vos comptes')
  })

  it('nothing shared: nothing shown', async () => {
    useAuthStore.setState({ user: { id: 'me', email: 'me@example.com', role: 'user' }, sharedAccounts: [] })
    const { container } = wrap(<SharedWithMe />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('accountLabel', () => {
  it('marks a shared and a disconnected account', async () => {
    const { accountLabel } = await import('../hooks/useAccount')
    const t = i18n.t.bind(i18n)
    expect(accountLabel({ id: '1', email: 'a@gmail.com', is_active: true }, t)).toBe('a@gmail.com')
    expect(accountLabel({ id: '2', email: 'b@gmail.com', is_active: true, shared_by: 'ana@example.com' }, t)).toBe('b@gmail.com (partagé par ana@example.com)')
    expect(accountLabel({ id: '3', email: 'c@gmail.com', is_active: false }, t)).not.toBe('c@gmail.com')
  })
})
