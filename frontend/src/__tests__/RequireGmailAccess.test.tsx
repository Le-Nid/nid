import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '../i18n'

const account = vi.hoisted(() => ({ value: null as null | { id: string; email: string; is_active: boolean; provider?: 'gmail' | 'imap' } }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: account.value?.id ?? null, account: account.value }) }))

import { RequireGmailAccess } from '../components/app/RequireGmailAccess'

const page = (imapOk?: boolean) => render(
  <MemoryRouter><RequireGmailAccess title="mails.title" imapOk={imapOk}><p>gmail page</p></RequireGmailAccess></MemoryRouter>,
)

beforeAll(() => i18n.changeLanguage('fr'))

describe('RequireGmailAccess', () => {
  it('an IMAP account gets Archives instead of a Gmail page, unless the page accepts it', () => {
    account.value = { id: 'a2', email: 'ana@mail.fr', is_active: true, provider: 'imap' }
    page()
    expect(screen.queryByText('gmail page')).not.toBeInTheDocument()
    expect(screen.getByText('ana@mail.fr est un compte IMAP')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir les archives' })).toHaveAttribute('href', '/archives')
  })

  it('the overview (imapOk) and Gmail accounts render the page', () => {
    account.value = { id: 'a2', email: 'ana@mail.fr', is_active: true, provider: 'imap' }
    page(true)
    expect(screen.getByText('gmail page')).toBeInTheDocument()
  })

  it('a Gmail account renders the page', () => {
    account.value = { id: 'a1', email: 'ana@gmail.com', is_active: true, provider: 'gmail' }
    page()
    expect(screen.getByText('gmail page')).toBeInTheDocument()
  })
})
