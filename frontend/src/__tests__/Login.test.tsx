import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import i18n from '../i18n'
import api from '../api/client'
import { useAuthStore } from '../store/auth.store'
import LoginPage from '../pages/Login'

const login = vi.fn()
const register = vi.fn()
const loginWithSsoCode = vi.fn()
const get = vi.mocked(api.get)

function setup(config: { allowRegistration: boolean; socialProviders: string[]; passwordResetEnabled?: boolean } = { allowRegistration: true, socialProviders: [] }, initialEntry = '/login') {
  get.mockImplementation((url: string) => url === '/api/auth/config'
    ? Promise.resolve({ data: config })
    : Promise.reject(new Error('down')))
  useAuthStore.setState({ login, register, loginWithSsoCode, initialLoading: true, isAuthenticated: false })
  const router = createMemoryRouter([
    { path: '/login', element: <LoginPage /> },
    { path: '*', element: <h1>elsewhere</h1> },
  ], { initialEntries: [initialEntry] })
  render(<RouterProvider router={router} />)
  return router
}

const fill = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Mot de passe'), password)
}

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('Login (/login)', () => {
  it('offers « Mot de passe oublié ? » only when the instance can send e-mails', async () => {
    const router = setup({ allowRegistration: true, socialProviders: [], passwordResetEnabled: true })
    await userEvent.click(await screen.findByRole('link', { name: 'Mot de passe oublié ?' }))
    expect(router.state.location.pathname).toBe('/reset-password')
  })

  it('hides « Mot de passe oublié ? » without SMTP', async () => {
    setup()
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: 'Mot de passe oublié ?' })).not.toBeInTheDocument()
  })

  it('checks the fields before calling the server', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(screen.getByText('Saisissez une adresse email valide')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Saisissez votre mot de passe')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it('signs in and goes to the overview', async () => {
    login.mockResolvedValue(undefined)
    const router = setup()
    await fill('ana@example.com', 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(login).toHaveBeenCalledWith('ana@example.com', 'secret', undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
  })

  it('skips the login (and the TOTP) while the session is still valid', async () => {
    const router = setup()
    useAuthStore.setState({ initialLoading: false, isAuthenticated: true })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
    expect(login).not.toHaveBeenCalled()
  })

  it('announces the server error', async () => {
    login.mockRejectedValue({ response: { data: { error: 'Identifiants invalides' } } })
    setup()
    await fill('ana@example.com', 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants invalides')
  })

  it('asks for the TOTP code when 2FA is on', async () => {
    login.mockRejectedValueOnce({ response: { data: { error: 'TOTP_REQUIRED' } } }).mockResolvedValueOnce(undefined)
    const router = setup()
    await fill('ana@example.com', 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    const code = await screen.findByLabelText('Code TOTP à 6 chiffres')
    const verify = screen.getByRole('button', { name: 'Vérifier' })
    expect(verify).toBeDisabled()
    await userEvent.type(code, '123456')
    await userEvent.click(verify)
    expect(login).toHaveBeenLastCalledWith('ana@example.com', 'secret', '123456')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
  })

  it('asks for the TOTP code after an SSO login when 2FA is on', async () => {
    loginWithSsoCode.mockRejectedValueOnce({ response: { data: { error: 'TOTP_REQUIRED' } } }).mockResolvedValueOnce(undefined)
    const router = setup(undefined, '/login?sso_code=abc')
    const code = await screen.findByLabelText('Code TOTP à 6 chiffres')
    expect(loginWithSsoCode).toHaveBeenCalledWith('abc')
    await userEvent.type(code, '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    expect(loginWithSsoCode).toHaveBeenLastCalledWith('abc', '123456')
    expect(login).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
  })

  it('registers with an 8-character password minimum', async () => {
    register.mockResolvedValue(undefined)
    const router = setup()
    await userEvent.click(await screen.findByRole('tab', { name: 'Créer un compte' }))
    await fill('new@example.com', 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
    expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères')).toHaveAttribute('role', 'alert')
    expect(register).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Mot de passe'), '-enough')
    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
    expect(register).toHaveBeenCalledWith('new@example.com', 'short-enough')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/settings/gmail'))
  })

  it('hides registration when closed and shows the providers', async () => {
    setup({ allowRegistration: false, socialProviders: ['google'] })
    const google = await screen.findByRole('button', { name: /Se connecter avec Google/ })
    expect(screen.queryByRole('tab', { name: 'Créer un compte' })).not.toBeInTheDocument()
    await userEvent.click(google)
    expect(get).toHaveBeenCalledWith('/api/auth/social/google/url')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de lancer la connexion')
  })

  it('toggles the password visibility', async () => {
    setup()
    const password = screen.getByLabelText('Mot de passe')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(password).toHaveAttribute('type', 'text')
  })
})
