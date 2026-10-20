import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import i18n from '../i18n'
import { DataList, dataListFeatures } from '../components/app/DataList'

type Mail = { id: string; subject: string; from: string; size: string; date: string; internalRef: string }

const MAILS: Mail[] = [
  { id: 'm1', subject: 'Facture octobre', from: 'billing@edf.fr', size: '1,2 Mo', date: '3 oct.', internalRef: 'ref-secret-1' },
  { id: 'm2', subject: 'Réunion lundi', from: 'bob@example.com', size: '12 Ko', date: '2 oct.', internalRef: 'ref-secret-2' },
]

const col = createColumnHelper<typeof dataListFeatures, Mail>()
const columns = col.columns([
  col.accessor('subject', { header: 'Objet', meta: { mobile: 'title' } }),
  col.accessor('from', { header: 'Expéditeur', meta: { mobile: 'subtitle' }, enableSorting: false }),
  col.accessor('date', { header: 'Date', meta: { mobile: 'meta' }, enableSorting: false }),
  col.accessor('size', { header: 'Taille', meta: { mobile: 'meta', align: 'end' } }),
  col.accessor('internalRef', { header: 'Réf.', meta: { mobile: 'hidden' }, enableSorting: false }),
])

function MailList({ data = MAILS, onOpen = vi.fn(), isLoading = false }: { data?: Mail[]; onOpen?: (id: string) => void; isLoading?: boolean }) {
  const table = useTable({
    features: dataListFeatures,
    columns,
    data,
    getRowId: (m) => m.id,
    enableRowSelection: true,
    manualSorting: true,
  })
  return (
    <DataList
      table={table}
      rowLabel={(row) => row.original.subject}
      onRowOpen={(row) => onOpen(row.id)}
      empty={<p>Aucun mail</p>}
      isLoading={isLoading}
    />
  )
}

// Controllable `(max-width: 767px)` media query, the one use-mobile listens to.
let mobile = false
const listeners = new Set<() => void>()
function setViewport(isMobile: boolean) {
  mobile = isMobile
  act(() => listeners.forEach((l) => l()))
}

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

describe('DataList', () => {
  it('renders a table on desktop', () => {
    render(<MailList />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'Objet', 'Expéditeur', 'Date', 'Taille', 'Réf.'])
    expect(screen.getByRole('row', { name: /Facture octobre/ })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders cards on mobile, placing columns by their mobile role', () => {
    mobile = true
    render(<MailList />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)

    const card = within(cards[0])
    expect(card.getByRole('button', { name: 'Facture octobre' })).toBeInTheDocument() // title = the card's open button
    expect(card.getByText('billing@edf.fr')).toHaveClass('line-clamp-2') // subtitle
    expect(card.getByText('3 oct.')).toBeInTheDocument() // first meta, next to the title
    expect(card.getByText('1,2 Mo')).toBeInTheDocument() // other meta
    expect(card.queryByText('ref-secret-1')).not.toBeInTheDocument() // hidden
  })

  it('switches table ↔ cards on the same instance, keeping the selection', async () => {
    render(<MailList />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Facture octobre' }))

    setViewport(true)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Facture octobre' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Réunion lundi' })).not.toBeChecked()

    setViewport(false)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Facture octobre' })).toBeChecked()
  })

  it('selects rows with named checkboxes and announces the count', async () => {
    render(<MailList />)
    const status = () => document.querySelector('[aria-live="polite"]')!

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Facture octobre' }))
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Facture octobre' })).toBeChecked()
    expect(status()).toHaveTextContent('1 ligne sélectionnée')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner toutes les lignes de la page' }))
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Réunion lundi' })).toBeChecked()
    expect(status()).toHaveTextContent('2 lignes sélectionnées')
  })

  it('toggles aria-sort on sortable headers only', async () => {
    render(<MailList />)
    const subject = screen.getByRole('columnheader', { name: 'Objet' })
    expect(subject).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: 'Expéditeur' })).not.toHaveAttribute('aria-sort')

    await userEvent.click(within(subject).getByRole('button', { name: 'Objet' }))
    expect(subject).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(subject).getByRole('button', { name: 'Objet' }))
    expect(subject).toHaveAttribute('aria-sort', 'descending')
  })

  it('opens a row from its title, not from its checkbox', async () => {
    const onOpen = vi.fn()
    render(<MailList onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Réunion lundi' }))
    expect(onOpen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Réunion lundi' }))
    expect(onOpen).toHaveBeenCalledWith('m2')
  })

  it('shows the empty slot, and skeletons while loading', () => {
    const { rerender } = render(<MailList data={[]} />)
    expect(screen.getByText('Aucun mail')).toBeInTheDocument()

    rerender(<MailList data={[]} isLoading />)
    expect(screen.queryByText('Aucun mail')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })
})
