import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import { SearchBar, type SavedSearch } from '../components/app/SearchBar'

beforeAll(() => i18n.changeLanguage('fr'))

const SAVED: SavedSearch[] = [
  { id: 's1', name: 'Promotions > 6 mois', query: 'category:promotions older_than:6m' },
  { id: 's2', name: 'Factures', query: 'label:factures', editable: true },
]

function Harness({ initial = '', onChange = vi.fn(), onSave }: Readonly<{ initial?: string; onChange?: (q: string) => void; onSave?: () => void }>) {
  const [value, setValue] = useState(initial)
  return <SearchBar value={value} onChange={(q) => { onChange(q); setValue(q) }} saved={SAVED} onSave={onSave} />
}

describe('SearchBar', () => {
  it('turns operators into removable tokens on Enter and keeps the free text', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('searchbox', { name: 'Rechercher dans les mails' })

    await userEvent.type(input, 'facture from:edf.fr subject:"avis de"{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('from:edf.fr subject:"avis de" facture')
    expect(input).toHaveValue('facture')
    expect(screen.getByRole('button', { name: 'Retirer le filtre from:edf.fr' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre from:edf.fr' }))
    expect(onChange).toHaveBeenLastCalledWith('subject:"avis de" facture')
    expect(screen.queryByRole('button', { name: 'Retirer le filtre from:edf.fr' })).not.toBeInTheDocument()
  })

  it('applies a saved search chip and marks it pressed', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Recherches enregistrées' })
    expect(group).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Promotions > 6 mois' }))
    expect(onChange).toHaveBeenCalledWith('category:promotions older_than:6m')
    expect(screen.getByRole('button', { name: 'Promotions > 6 mois' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Factures' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Retirer le filtre older_than:6m' })).toBeInTheDocument()
  })

  it('offers to save an unsaved, non-empty search only', async () => {
    const onSave = vi.fn()
    const { unmount } = render(<Harness onSave={onSave} />)
    expect(screen.queryByRole('button', { name: 'Enregistrer la recherche' })).not.toBeInTheDocument()
    unmount()

    render(<Harness initial="is:unread" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la recherche' }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('offers rename and delete on the active editable chip only', async () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const { rerender } = render(<SearchBar value="category:promotions older_than:6m" onChange={vi.fn()} saved={SAVED} onRename={onRename} onDelete={onDelete} />)
    expect(screen.queryByRole('button', { name: /^Renommer/ })).not.toBeInTheDocument()

    rerender(<SearchBar value="label:factures" onChange={vi.fn()} saved={SAVED} onRename={onRename} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Renommer Factures' }))
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Factures' }))
    expect(onRename).toHaveBeenCalledWith(SAVED[1])
    expect(onDelete).toHaveBeenCalledWith(SAVED[1])
  })
})
