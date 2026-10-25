import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import i18n from '../i18n'
import { authApi } from '../api'
import ResetPasswordPage from '../pages/ResetPassword'

vi.mock('../api', () => ({ authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() } }))

function setup(url: string) {
  const router = createMemoryRouter([
    { path: '/reset-password', element: <ResetPasswordPage /> },
    { path: '/login', element: <h1>login</h1> },
  ], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('Mot de passe oublié (/reset-password)', () => {
  it('sends the link and gives the same answer whatever the address', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue(undefined)
    setup('/reset-password')
    await userEvent.type(screen.getByLabelText('Email'), ' ana@example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }))
    expect(authApi.forgotPassword).toHaveBeenCalledWith('ana@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('Si un compte avec mot de passe existe')
  })

  it('sets the new password from the e-mailed token, checking the confirmation first', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue(undefined)
    setup('/reset-password?token=abc123')
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe (8 caractères minimum)'), 'new-password')
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'typo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Les deux mots de passe ne correspondent pas.')
    expect(authApi.resetPassword).not.toHaveBeenCalled()

    const confirm = screen.getByLabelText('Confirmer le nouveau mot de passe')
    await userEvent.clear(confirm)
    await userEvent.type(confirm, 'new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }))
    expect(authApi.resetPassword).toHaveBeenCalledWith('abc123', 'new-password')
    expect(await screen.findByRole('status')).toHaveTextContent('Mot de passe changé')
  })

  it('says when the link is dead, and links back to the login', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(new Error('400'))
    const router = setup('/reset-password?token=used')
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe (8 caractères minimum)'), 'new-password')
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ce lien est invalide'))
    await userEvent.click(screen.getByRole('link', { name: 'Retour à la connexion' }))
    expect(router.state.location.pathname).toBe('/login')
  })
})
