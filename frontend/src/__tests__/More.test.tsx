import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import i18n from '../i18n'
import { useAuthStore } from '../store/auth.store'
import type { LiveCounters } from '../hooks/useLiveCounters'
import MorePage from '../pages/More'

const logout = vi.fn(() => Promise.resolve())

function setup(role = 'admin', counters: LiveCounters | null = null) {
  useAuthStore.setState({
    user: { id: 'u1', email: 'ana@example.com', role, totp_enabled: true },
    gmailAccounts: [{ id: 'a1', email: 'ana@gmail.com', is_active: true, needs_reauth: true }, { id: 'a2', email: 'pro@gmail.com', is_active: true }],
    activeAccountId: 'a1',
    logout,
  })
  const router = createMemoryRouter([{
    element: <Outlet context={counters} />,
    children: [{ path: '/more', element: <MorePage /> }, { path: '*', element: <h1>elsewhere</h1> }],
  }], { initialEntries: ['/more'] })
  render(<RouterProvider router={router} />)
  return router
}

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('« Plus » (/more)', () => {
  it('groups tools, the five settings sections with a summary, and admin', () => {
    setup('admin', { mails: {}, activeRules: 3, activeJobs: 2 })
    const tools = screen.getByRole('region', { name: 'Outils' })
    expect(within(tools).getByRole('link', { name: 'Activité 2 en cours' })).toHaveAttribute('href', '/activity')
    expect(within(tools).getByRole('link', { name: 'Règles & libellés 3' })).toHaveAttribute('href', '/rules')

    const settings = screen.getByRole('region', { name: 'Paramètres' })
    expect(within(settings).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/settings/account', '/settings/security', '/settings/gmail', '/settings/notifications', '/settings/data',
    ])
    expect(within(settings).getByRole('link', { name: /Sécurité.*2FA activée/ })).toBeInTheDocument()
    expect(within(settings).getByRole('link', { name: /Comptes Gmail.*1 action requise/ })).toBeInTheDocument()
    expect(within(settings).getByRole('link', { name: /Données.*Import, export/ })).toBeInTheDocument()

    expect(within(screen.getByRole('region', { name: 'Administration' })).getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  it('hides Administration from other users and logs out', async () => {
    const router = setup('user')
    expect(screen.queryByRole('region', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.getByText('Connecté(e) en tant que ana@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter de Nid' }))
    expect(logout).toHaveBeenCalled()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
