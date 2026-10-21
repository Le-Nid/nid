import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import { BulkActionBar, type BulkAction } from '../components/app/BulkActionBar'

// Controllable `(max-width: 767px)` media query, the one use-mobile listens to.
let mobile = false
const listeners = new Set<() => void>()

beforeAll(() => i18n.changeLanguage('fr'))

beforeEach(() => {
  mobile = false
  listeners.clear()
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    get matches() { return query.includes('max-width') ? mobile : false },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList)
})

const makeActions = (): BulkAction[] => [
  { label: 'Archiver', onSelect: vi.fn() },
  { label: 'Sauvegarder sur le NAS', onSelect: vi.fn() },
  { label: 'Créer une règle', onSelect: vi.fn() },
  { label: 'Supprimer', onSelect: vi.fn(), destructive: true },
  { label: 'Marquer comme lu', onSelect: vi.fn() },
]

describe('BulkActionBar', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(<BulkActionBar count={0} mode="ids" actions={makeActions()} onClear={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the count, runs actions and clears the selection (desktop)', async () => {
    const actions = makeActions()
    const onClear = vi.fn()
    render(<BulkActionBar count={3} mode="ids" actions={actions} onClear={onClear} />)

    const bar = screen.getByRole('toolbar', { name: 'Actions sur la sélection' })
    expect(within(bar).getByText('3 sélectionnés')).toHaveAttribute('aria-live', 'polite')
    expect(within(bar).getAllByRole('button')).toHaveLength(6) // 5 actions + clear

    await userEvent.click(within(bar).getByRole('button', { name: 'Supprimer' }))
    expect(actions[3].onSelect).toHaveBeenCalledOnce()
    await userEvent.click(within(bar).getByRole('button', { name: 'Annuler la sélection' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('offers to select every search result when the whole page is selected (I2)', async () => {
    const onSelectAll = vi.fn()
    render(<BulkActionBar count={50} total={12431} mode="ids" actions={makeActions()} onSelectAll={onSelectAll} onClear={vi.fn()} />)

    expect(screen.getByText(/Les 50 mails de cette page sont sélectionnés/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Sélectionner les ~12\s431 résultats de la recherche/ }))
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it('shows the estimate in query mode, without the banner', () => {
    render(<BulkActionBar count={50} total={12431} mode="query" actions={makeActions()} onSelectAll={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/~12\s431 sélectionnés/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /résultats de la recherche/ })).not.toBeInTheDocument()
  })

  it('is a bottom bar on mobile with four actions and the rest under « Plus »', async () => {
    mobile = true
    const actions = makeActions()
    render(<BulkActionBar count={1} mode="ids" actions={actions} onClear={vi.fn()} />)

    const bar = screen.getByRole('toolbar', { name: 'Actions sur la sélection' })
    expect(bar).toHaveClass('fixed', 'bottom-0')
    expect(within(bar).getByText('1 sélectionné')).toBeInTheDocument()
    expect(within(bar).queryByRole('button', { name: 'Marquer comme lu' })).not.toBeInTheDocument()

    await userEvent.click(within(bar).getByRole('button', { name: 'Plus' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marquer comme lu' }))
    expect(actions[4].onSelect).toHaveBeenCalledOnce()
  })

  it('switches layout when the viewport crosses md', () => {
    render(<BulkActionBar count={2} mode="ids" actions={makeActions()} onClear={vi.fn()} />)
    expect(screen.getByRole('toolbar')).not.toHaveClass('fixed')
    mobile = true
    act(() => listeners.forEach((l) => l()))
    expect(screen.getByRole('toolbar')).toHaveClass('fixed')
  })
})
