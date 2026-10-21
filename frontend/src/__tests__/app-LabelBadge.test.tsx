import { render, screen } from '@testing-library/react'
import i18n from '../i18n'
import { LabelBadge } from '../components/app/LabelBadge'

describe('LabelBadge', () => {
  beforeEach(() => i18n.changeLanguage('fr'))

  it.each([
    ['CATEGORY_PROMOTIONS', 'Promotions', 'promotions'],
    ['CATEGORY_SOCIAL', 'Réseaux sociaux', 'social'],
    ['CATEGORY_UPDATES', 'Mises à jour', 'updates'],
    ['CATEGORY_FORUMS', 'Forums', 'forums'],
  ])('translates %s and uses its verified color pair', (name, text, id) => {
    render(<LabelBadge label={{ name, type: 'system' }} />)
    expect(screen.getByText(text)).toHaveClass(`bg-cat-${id}-bg`, `text-cat-${id}-fg`)
  })

  it('translates categories in English too', async () => {
    await i18n.changeLanguage('en')
    render(<LabelBadge label={{ name: 'CATEGORY_SOCIAL', type: 'system' }} />)
    expect(screen.getByText('Social')).toBeInTheDocument()
  })

  it('shows a user label as a Gmail-colored dot and foreground text (R2)', () => {
    render(<LabelBadge label={{ name: 'Factures/EDF', type: 'user', color: '#fb4c2f' }} />)
    const text = screen.getByText('Factures/EDF')
    const badge = text.parentElement!
    expect(badge).toHaveClass('text-foreground')
    const dot = badge.querySelector<HTMLElement>('[aria-hidden="true"]')!
    expect(dot.style.backgroundColor).toBe('rgb(251, 76, 47)')
  })

  it('falls back to a neutral dot for an uncolored user label', () => {
    render(<LabelBadge label={{ name: 'Perso', type: 'user' }} />)
    expect(screen.getByText('Perso').parentElement!.querySelector('[aria-hidden="true"]')).toHaveClass('bg-muted-foreground')
  })

  it('hides other system labels', () => {
    const { container } = render(<LabelBadge label={{ name: 'INBOX', type: 'system' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
