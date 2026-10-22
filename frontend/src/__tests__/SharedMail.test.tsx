import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import i18n from '../i18n'
import api from '../api/client'
import SharedMailPage from '../pages/SharedMail'

const get = vi.mocked(api.get)

function setup() {
  const router = createMemoryRouter([{ path: '/shared/:token', element: <SharedMailPage /> }], { initialEntries: ['/shared/tok'] })
  render(<RouterProvider router={router} />)
}

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('Shared mail (/shared/:token)', () => {
  it('shows the mail in the sandboxed viewer, remote content blocked', async () => {
    get.mockResolvedValue({ data: { subject: 'Facture', sender: 'shop@example.com', recipient: 'ana@example.com', date: '2026-03-01T10:00:00Z', htmlBody: '<p>Hi</p><img src="https://t.example/p.gif">' } })
    setup()
    expect(await screen.findByRole('heading', { name: 'Facture' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/shares/public/tok')
    expect(screen.getByText('shop@example.com')).toBeInTheDocument()
    expect(screen.getByText('À: ana@example.com')).toBeInTheDocument()
    const frame = screen.getByTitle('Contenu du mail')
    expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
    expect(frame.getAttribute('srcdoc')).toContain("img-src data: blob:")
    expect(screen.getByRole('button', { name: 'Afficher' })).toBeInTheDocument()
  })

  it('falls back to the text body', async () => {
    get.mockResolvedValue({ data: { subject: '', sender: 'a@b.c', textBody: 'plain text' } })
    setup()
    expect(await screen.findByRole('heading', { name: '(sans sujet)' })).toBeInTheDocument()
    expect(screen.getByText('plain text')).toBeInTheDocument()
  })

  it('says the link is invalid or expired', async () => {
    get.mockRejectedValue(new Error('404'))
    setup()
    expect(await screen.findByText('Lien introuvable')).toBeInTheDocument()
    expect(screen.getByText(/invalide, a expiré/)).toBeInTheDocument()
  })
})
