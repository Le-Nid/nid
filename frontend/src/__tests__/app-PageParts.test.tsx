import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inbox } from 'lucide-react'
import { EmptyState } from '../components/app/EmptyState'
import { PageHeader } from '../components/app/PageHeader'

describe('PageHeader', () => {
  it('renders the page h1, description and actions', () => {
    render(<PageHeader title="Mails" description="48 212 mails" actions={<button type="button">Synchroniser</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mails' })).toBeInTheDocument()
    expect(screen.getByText('48 212 mails')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Synchroniser' })).toBeInTheDocument()
  })

  it('renders the title alone', () => {
    const { container } = render(<PageHeader title="Archives" />)
    expect(container.querySelectorAll('p, button')).toHaveLength(0)
  })
})

describe('EmptyState', () => {
  it('shows title, description and a working action', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <EmptyState
        icon={<Inbox />}
        title="Aucun mail ne correspond"
        description="Essayez d'autres filtres."
        action={<button type="button" onClick={onClick}>Effacer les filtres</button>}
      />,
    )
    expect(screen.getByText('Aucun mail ne correspond')).toBeInTheDocument()
    expect(screen.getByText("Essayez d'autres filtres.")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty-icon"]')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders without icon, description or action', () => {
    const { container } = render(<EmptyState title="Rien ici" />)
    expect(screen.getByText('Rien ici')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty-icon"], [data-slot="empty-description"], [data-slot="empty-content"]')).toBeNull()
  })
})
