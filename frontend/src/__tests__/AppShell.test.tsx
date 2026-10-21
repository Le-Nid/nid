import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Empty } from 'antd'
import i18n from '../i18n'
import App from '../App'
import LegacyAntd from '../components/LegacyAntd'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'

// Pages are lazy and tested on their own: each one is a probe showing where the router landed.
const probe = vi.hoisted(() => async () => {
  const { useLocation } = await import('react-router')
  return { default: () => { const { pathname, search } = useLocation(); return <h1>{pathname + search}</h1> } }
})
vi.mock('../pages/Login', probe)
vi.mock('../pages/Overview', probe)
vi.mock('../pages/Mails', probe)
vi.mock('../pages/Archives', probe)
vi.mock('../pages/Settings', probe)
vi.mock('../pages/Jobs', probe)
vi.mock('../pages/Rules', probe)
vi.mock('../pages/Admin', probe)
vi.mock('../pages/Cleanup', probe)
vi.mock('../hooks/useGlobalJobNotifier', () => ({ useGlobalJobNotifier: vi.fn() }))
vi.mock('../components/NotificationBell', () => ({ default: () => null }))

let mobile = false
const logout = vi.fn(() => Promise.resolve())
const setActiveAccount = vi.fn()

function login(role = 'admin') {
  useAuthStore.setState({
    initialLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 'ana@example.com', role },
    gmailAccounts: [{ id: 'a1', email: 'ana@gmail.com', is_active: true }, { id: 'a2', email: 'pro@gmail.com', is_active: true }],
    activeAccountId: 'a1',
    fetchMe: vi.fn(() => Promise.resolve()),
    logout,
    setActiveAccount,
  })
}

function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><App /></MemoryRouter>)
}
const landedOn = (url: string) => screen.findByRole('heading', { level: 1, name: url })

beforeAll(async () => {
  await i18n.changeLanguage('fr')
  Element.prototype.scrollIntoView = vi.fn() // cmdk scrolls the active item; jsdom has no layout
})

beforeEach(() => {
  mobile = false
  vi.clearAllMocks()
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList)
  useThemeStore.setState({ mode: 'light' })
  login()
})

describe('routes', () => {
  it.each([
    ['/', '/overview'],
    ['/dashboard?tab=1', '/overview?tab=1'],
    ['/analytics', '/overview'],
    ['/insights', '/overview'],
    ['/archive?q=x', '/archives?q=x'],
    ['/jobs?status=failed', '/activity?status=failed'],
    ['/settings?gmail=connected', '/settings/account?gmail=connected'],
    ['/unsubscribe', '/cleanup?tab=senders'],
    ['/expiration', '/rules?tab=labels'],
    ['/sharing', '/archives?tab=shares'],
  ])('redirects %s to %s, keeping the query string', async (from, to) => {
    renderAt(from)
    expect(await landedOn(to)).toBeInTheDocument()
  })

  it('sends signed-out users to /login', async () => {
    useAuthStore.setState({ isAuthenticated: false })
    renderAt('/overview')
    expect(await landedOn('/login')).toBeInTheDocument()
  })

  it('shows a loading skeleton while the session is restored', () => {
    useAuthStore.setState({ initialLoading: true })
    renderAt('/overview')
    expect(screen.getByRole('status', { name: 'Chargement' })).toBeInTheDocument()
  })

  it('keeps /admin for admins and sends other users to /overview', async () => {
    const { unmount } = renderAt('/admin')
    expect(await landedOn('/admin')).toBeInTheDocument()
    unmount()

    login('user')
    renderAt('/admin')
    expect(await landedOn('/overview')).toBeInTheDocument()
  })
})

describe('desktop sidebar', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Navigation principale' })
  const SEVEN = ["Vue d'ensemble", 'Mails', 'Nettoyage', 'Règles & libellés', 'Archives', 'Activité', 'Paramètres']

  it('lists the 8 entries for an admin and marks the current one', async () => {
    renderAt('/archives')
    await landedOn('/archives')
    expect(within(nav()).getAllByRole('link').map((l) => l.textContent)).toEqual([...SEVEN, 'Admin'])
    expect(within(nav()).getByRole('link', { name: 'Archives' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).getByRole('link', { name: 'Mails' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('button', { name: 'Plus' })).not.toBeInTheDocument()
  })

  it('hides Admin from other users', async () => {
    login('user')
    renderAt('/overview')
    await landedOn('/overview')
    expect(within(nav()).getAllByRole('link').map((l) => l.textContent)).toEqual(SEVEN)
  })

  it('collapses and expands', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(screen.getByRole('button', { name: 'Réduire la barre latérale' }))
    expect(screen.getByRole('button', { name: 'Développer la barre latérale' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: 'Compte Gmail' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Développer la barre latérale' }))
    expect(screen.getByRole('button', { name: 'Réduire la barre latérale' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches the active Gmail account', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Compte Gmail' }), 'pro@gmail.com')
    expect(setActiveAccount).toHaveBeenCalledWith('a2')
  })

  it('navigates from a sidebar link', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(within(nav()).getByRole('link', { name: 'Nettoyage' }))
    expect(await landedOn('/cleanup')).toBeInTheDocument()
  })
})

describe('command palette', () => {
  it('opens with Ctrl+K and navigates to the selected page', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Palette de commandes' })
    await userEvent.click(within(palette).getByRole('option', { name: 'Activité' }))
    expect(await landedOn('/activity')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('« Nouvelle règle » opens /rules?new=1', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByRole('dialog', { name: 'Palette de commandes' })
    await userEvent.click(within(palette).getByRole('option', { name: 'Nouvelle règle' }))
    expect(await landedOn('/rules?new=1')).toBeInTheDocument()
  })

  it('opens from the sidebar search button and lists legacy pages', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(screen.getByRole('button', { name: /Rechercher/ }))
    const palette = await screen.findByRole('dialog', { name: 'Palette de commandes' })
    expect(within(palette).getByRole('option', { name: 'Admin' })).toBeInTheDocument()
    expect(within(palette).getByRole('group', { name: 'Autres pages (en cours de migration)' })).toBeInTheDocument()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('mobile bottom bar', () => {
  beforeEach(() => { mobile = true })

  it('shows 4 destinations and Plus instead of the sidebar', async () => {
    renderAt('/mails')
    await landedOn('/mails')
    const bar = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(bar).getAllByRole('link').map((l) => l.textContent)).toEqual(['Accueil', 'Mails', 'Nettoyage', 'Archives'])
    expect(within(bar).getByRole('link', { name: 'Mails' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('button', { name: 'Plus' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réduire la barre latérale' })).not.toBeInTheDocument()
  })

  it('opens the Plus sheet with the other entries and logout', async () => {
    renderAt('/rules')
    await landedOn('/rules')
    await userEvent.click(screen.getByRole('button', { name: 'Plus' }))
    const sheet = await screen.findByRole('dialog', { name: 'Plus' })
    expect(within(sheet).getAllByRole('link').map((l) => l.textContent)).toEqual(['Règles & libellés', 'Activité', 'Paramètres', 'Admin'])
    expect(within(sheet).getByRole('link', { name: 'Règles & libellés' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(within(sheet).getByRole('link', { name: 'Activité' }))
    expect(await landedOn('/activity')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no Admin entry for other users, and logs out from the sheet', async () => {
    login('user')
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(screen.getByRole('button', { name: 'Plus' }))
    const sheet = await screen.findByRole('dialog', { name: 'Plus' })
    expect(within(sheet).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Se déconnecter' }))
    expect(logout).toHaveBeenCalled()
    expect(await landedOn('/login')).toBeInTheDocument()
  })
})

describe('user menu', () => {
  it('toggles dark mode and logs out', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(screen.getByRole('button', { name: /^Menu utilisateur/ }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Mode sombre' }))
    expect(useThemeStore.getState().mode).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: /^Menu utilisateur/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }))
    expect(logout).toHaveBeenCalled()
    expect(await landedOn('/login')).toBeInTheDocument()
  })

  it('switches account and language on mobile', async () => {
    mobile = true
    renderAt('/overview')
    await landedOn('/overview')
    await userEvent.click(screen.getByRole('button', { name: /^Menu utilisateur/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'pro@gmail.com' }))
    expect(setActiveAccount).toHaveBeenCalledWith('a2')

    await userEvent.click(screen.getByRole('button', { name: /^Menu utilisateur/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'English' }))
    expect(i18n.language).toBe('en')
    await i18n.changeLanguage('fr')
  })
})

describe('live counters (B3, D6)', () => {
  class FakeEventSource {
    static last: FakeEventSource
    listeners: Record<string, (e: { data: string }) => void> = {}
    constructor(public url: string) { FakeEventSource.last = this }
    addEventListener(type: string, fn: (e: { data: string }) => void) { this.listeners[type] = fn }
    close = vi.fn()
  }
  const push = (data: object) => act(() => FakeEventSource.last.listeners.counters({ data: JSON.stringify(data) }))

  beforeEach(() => { (globalThis as any).EventSource = FakeEventSource })
  afterEach(() => { delete (globalThis as any).EventSource })

  it('shows the badges inside the sidebar links and announces running jobs only', async () => {
    renderAt('/overview')
    await landedOn('/overview')
    expect(FakeEventSource.last.url).toBe('/api/events')
    const status = document.querySelector('[aria-live="polite"]')!
    expect(status).toHaveTextContent('')

    await push({ mails: { a1: 48212, a2: 5 }, activeRules: 3, activeJobs: 2 })
    expect(screen.getByRole('link', { name: /^Mails 48\s212$/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Règles & libellés 3' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activité 2 en cours' })).toBeInTheDocument()
    expect(status).toHaveTextContent('Activité : 2 en cours')

    await push({ mails: { a1: null }, activeRules: 0, activeJobs: 0 })
    expect(screen.getByRole('link', { name: 'Mails' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activité' })).toBeInTheDocument()
    expect(status).toHaveTextContent('')
  })

  it('shows the badges in the mobile Plus sheet', async () => {
    mobile = true
    renderAt('/overview')
    await landedOn('/overview')
    await push({ mails: {}, activeRules: 1, activeJobs: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Plus' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('link', { name: 'Activité 1 en cours' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Règles & libellés 1' })).toBeInTheDocument()
  })

  it('closes the stream when the shell unmounts', async () => {
    const { unmount } = renderAt('/overview')
    await landedOn('/overview')
    unmount()
    expect(FakeEventSource.last.close).toHaveBeenCalled()
  })
})

describe('LegacyAntd', () => {
  it('gives antd children its locale and theme', async () => {
    useThemeStore.setState({ mode: 'dark' })
    const { rerender } = render(<LegacyAntd><Empty /></LegacyAntd>)
    expect(screen.getByText('Aucune donnée', { selector: 'div' })).toBeInTheDocument()

    await i18n.changeLanguage('en')
    rerender(<LegacyAntd><Empty /></LegacyAntd>)
    expect(screen.getByText('No data', { selector: 'div' })).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })
})
