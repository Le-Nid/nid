import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import {
  configApi, dashboardApi, gmailAccountsApi, importApi, labelsApi, notificationsApi, sharingApi, twoFactorApi, webhooksApi,
} from '../api'
import { useAuthStore } from '../store/auth.store'
import { useThemeStore } from '../store/theme.store'
import { saveBlob } from '../utils/download'

vi.mock('../api', () => ({
  dashboardApi: { getArchiveStats: vi.fn() },
  notificationsApi: { getPreferences: vi.fn(), updatePreferences: vi.fn() },
  twoFactorApi: { setup: vi.fn(), enable: vi.fn(), disable: vi.fn() },
  sharingApi: { list: vi.fn() },
  webhooksApi: { list: vi.fn(), create: vi.fn(), toggle: vi.fn(), remove: vi.fn(), test: vi.fn() },
  configApi: { exportConfig: vi.fn(), importConfig: vi.fn() },
  importApi: { importMbox: vi.fn(), importImap: vi.fn(), exportMbox: vi.fn() },
  labelsApi: { sync: vi.fn() },
  gmailAccountsApi: { connectUrl: vi.fn(), update: vi.fn(), toggle: vi.fn(), disconnect: vi.fn() },
}))
vi.mock('../utils/download', () => ({ saveBlob: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import SettingsPage from '../pages/Settings'

const ACCOUNT = { id: 'acc-1', email: 'ana@gmail.com', is_active: true, backup_enabled: true, backup_interval: '24h' as const, needs_reauth: false, last_sync_at: '2026-10-20T08:00:00Z' }
const PREFS = { weekly_report: true, job_completed: true, job_failed: true, rule_executed: false, quota_warning: true, integrity_alert: true,
  weekly_report_toast: false, job_completed_toast: true, job_failed_toast: true, rule_executed_toast: false, quota_warning_toast: false,
  integrity_alert_toast: false, remote_images: 'block' }
const WEBHOOK = { id: 'w1', name: 'Discord', url: 'https://discord.test/x', type: 'discord', events: ['job.failed'], is_active: true, last_status: 204 }

let mobile = false
const fetchMe = vi.fn(() => Promise.resolve())

function setup(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{
    element: <Outlet context={{ mails: { 'acc-1': 48212 }, activeRules: 0, activeJobs: 0 }} />,
    children: [
      { path: '/settings/:section', element: <SettingsPage /> },
      { path: '/more', element: <h1>more</h1> },
    ],
  }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

beforeAll(() => i18n.changeLanguage('fr'))

beforeEach(() => {
  vi.clearAllMocks()
  mobile = false
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList)
  useAuthStore.setState({
    user: { id: 'u1', email: 'ana@example.com', role: 'user', display_name: 'Ana', storage_quota_bytes: 5 * 1024 ** 3, max_gmail_accounts: 3 },
    gmailAccounts: [ACCOUNT], activeAccountId: 'acc-1', storageUsedBytes: 1024 ** 2, fetchMe,
  })
  vi.mocked(notificationsApi.getPreferences).mockResolvedValue(PREFS)
  vi.mocked(notificationsApi.updatePreferences).mockResolvedValue({ ok: true })
  vi.mocked(dashboardApi.getArchiveStats).mockResolvedValue({ total_mails: 24106, last_archived_at: '2026-10-21T03:00:00Z' })
  vi.mocked(sharingApi.list).mockResolvedValue([{ id: 's1' }, { id: 's2' }])
  vi.mocked(webhooksApi.list).mockResolvedValue([WEBHOOK])
})

describe('desktop layout', () => {
  it('shows the five sections as tabs and switches section in the URL', async () => {
    const router = setup('/settings/account')
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument()
    const tabs = screen.getByRole('tablist', { name: 'Sections des paramètres' })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Compte', 'Sécurité', 'Comptes Gmail', 'Notifications & webhooks', 'Données'])
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Données' }))
    expect(router.state.location.pathname).toBe('/settings/data')
  })

  it('redirects an unknown section to Compte', async () => {
    const router = setup('/settings/privacy')
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account'))
  })
})

describe('mobile layout', () => {
  it('is one page per section with a way back to Plus', async () => {
    mobile = true
    const router = setup('/settings/security')
    expect(screen.getByRole('heading', { level: 1, name: 'Sécurité' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Plus' }))
    expect(router.state.location.pathname).toBe('/more')
  })
})

describe('Compte', () => {
  it('shows the profile and switches the theme', async () => {
    setup('/settings/account')
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('Archives : 1 Mo utilisés sur 5 Go')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Sombre' }))
    expect(useThemeStore.getState()).toMatchObject({ pref: 'dark', mode: 'dark' })
    await userEvent.click(screen.getByRole('radio', { name: 'Système' }))
    expect(useThemeStore.getState().pref).toBe('system')
  })

  it('allows remote images (B10) and turns single-key shortcuts off', async () => {
    setup('/settings/account')
    const images = screen.getByRole('switch', { name: 'Afficher les images distantes' })
    await waitFor(() => expect(images).toBeEnabled())
    expect(images).not.toBeChecked()
    vi.mocked(notificationsApi.getPreferences).mockResolvedValue({ ...PREFS, remote_images: 'allow' })
    await userEvent.click(images)
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({ remote_images: 'allow' })
    await waitFor(() => expect(images).toBeChecked())

    await userEvent.click(screen.getByRole('switch', { name: 'Raccourcis clavier à une touche' }))
    expect(localStorage.setItem).toHaveBeenCalledWith('nid.mailShortcuts', 'off')
  })

  it('flips a preference back when the server refuses it', async () => {
    vi.mocked(notificationsApi.updatePreferences).mockRejectedValue(new Error('500'))
    setup('/settings/account')
    const images = screen.getByRole('switch', { name: 'Afficher les images distantes' })
    await waitFor(() => expect(images).toBeEnabled())
    await userEvent.click(images)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'enregistrer ce réglage. Réessayez."))
    await waitFor(() => expect(images).not.toBeChecked())
  })
})

describe('Sécurité', () => {
  it('sets up 2FA: QR code, then a 6-digit code enables it', async () => {
    vi.mocked(twoFactorApi.setup).mockResolvedValue({ secret: 'JBSWY3DP', qrDataUrl: 'data:image/png;base64,xx' })
    vi.mocked(twoFactorApi.enable).mockResolvedValue({ ok: true })
    setup('/settings/security')
    await userEvent.click(screen.getByRole('button', { name: 'Configurer la 2FA' }))
    expect(await screen.findByRole('img', { name: 'QR code de configuration 2FA' })).toBeInTheDocument()
    expect(screen.getByText('JBSWY3DP')).toBeInTheDocument()
    const verify = screen.getByRole('button', { name: 'Vérifier et activer' })
    expect(verify).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '12a3456')
    await userEvent.click(verify)
    expect(twoFactorApi.enable).toHaveBeenCalledWith('123456', expect.anything())
    await waitFor(() => expect(fetchMe).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('2FA activée')
  })

  it('disables 2FA with a code and shows the server error on a wrong one', async () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'ana@example.com', role: 'user', totp_enabled: true } })
    vi.mocked(twoFactorApi.disable).mockRejectedValue({ response: { data: { error: 'Invalid TOTP code' } } })
    setup('/settings/security')
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver la 2FA' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid TOTP code'))
  })

  it('links to the share links in Archives instead of listing them', async () => {
    setup('/settings/security')
    expect(await screen.findByText('2 liens de partage actifs')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gérer les liens de partage dans Archives' })).toHaveAttribute('href', '/archives?tab=shares')
  })
})

describe('Comptes Gmail', () => {
  it('shows state, last sync with the live count, and the last backup with coverage', async () => {
    setup('/settings/gmail')
    expect(screen.getByRole('heading', { name: 'ana@gmail.com' })).toBeInTheDocument()
    expect(screen.getByText('Synchronisé')).toBeInTheDocument()
    expect(screen.getByText(/48.212 mails dans Gmail/)).toBeInTheDocument()
    expect(await screen.findByText(/24.106 mails · 50.%/)).toBeInTheDocument()
  })

  it('changes the automatic backup (B12)', async () => {
    vi.mocked(gmailAccountsApi.update).mockResolvedValue({})
    setup('/settings/gmail')
    await userEvent.selectOptions(screen.getByLabelText('Fréquence'), 'Toutes les 6 heures')
    expect(gmailAccountsApi.update).toHaveBeenCalledWith('acc-1', { backup_interval: '6h' })
    await userEvent.click(screen.getByRole('switch', { name: 'Sauvegarde automatique' }))
    expect(gmailAccountsApi.update).toHaveBeenCalledWith('acc-1', { backup_enabled: false })
    await waitFor(() => expect(fetchMe).toHaveBeenCalled())
  })

  it('asks before disconnecting and says the archives stay', async () => {
    vi.mocked(gmailAccountsApi.disconnect).mockResolvedValue(undefined)
    setup('/settings/gmail')
    await userEvent.click(screen.getByRole('button', { name: 'Déconnecter' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Déconnecter ana@gmail.com ?' })
    expect(dialog).toHaveTextContent('Ses archives restent sur le NAS.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Déconnecter' }))
    expect(gmailAccountsApi.disconnect).toHaveBeenCalledWith('acc-1', expect.anything())
  })

  it('syncs now, and reconnects an account Google cut off', async () => {
    vi.mocked(labelsApi.sync).mockResolvedValue({ synced: 12 })
    vi.mocked(gmailAccountsApi.connectUrl).mockReturnValue(new Promise(() => {}))
    useAuthStore.setState({ gmailAccounts: [ACCOUNT, { ...ACCOUNT, id: 'acc-2', email: 'pro@gmail.com', needs_reauth: true }] })
    setup('/settings/gmail')
    expect(screen.getByText('Action requise')).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('button', { name: 'Synchroniser maintenant' })
    expect(second).toBeDisabled()
    await userEvent.click(first)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Synchronisation terminée'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Reconnecter avec Google' })[1])
    expect(gmailAccountsApi.connectUrl).toHaveBeenCalled()
  })

  it('resumes a paused account', async () => {
    vi.mocked(gmailAccountsApi.toggle).mockResolvedValue({})
    useAuthStore.setState({ gmailAccounts: [{ ...ACCOUNT, is_active: false }] })
    setup('/settings/gmail')
    expect(screen.getByText('En pause')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre la synchronisation' }))
    expect(gmailAccountsApi.toggle).toHaveBeenCalledWith('acc-1', expect.anything())
  })

  it('adds an account, and explains a refused one', async () => {
    vi.mocked(gmailAccountsApi.connectUrl).mockRejectedValue({ response: { status: 403 } })
    setup('/settings/gmail?gmail=connected&account=ana%40gmail.com')
    expect(screen.getByRole('status')).toHaveTextContent('Compte Gmail connecté : ana@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un compte Gmail' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nombre maximal de comptes Gmail atteint'))
  })

  it('offers to add one when there is none', () => {
    useAuthStore.setState({ gmailAccounts: [] })
    setup('/settings/gmail?gmail=error')
    expect(screen.getByRole('alert')).toHaveTextContent('La connexion à Gmail a échoué')
    expect(screen.getByText('Aucun compte Gmail connecté')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un compte Gmail' })).toBeEnabled()
  })
})

describe('Notifications & webhooks', () => {
  it('saves a notification switch', async () => {
    setup('/settings/notifications')
    const toastSwitch = screen.getByRole('switch', { name: 'Toast — Règle exécutée' })
    await waitFor(() => expect(toastSwitch).toBeEnabled())
    await userEvent.click(toastSwitch)
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({ rule_executed_toast: true })
  })

  it('lists webhooks, toggles, tests and deletes one after confirmation', async () => {
    for (const fn of [webhooksApi.toggle, webhooksApi.test, webhooksApi.remove]) vi.mocked(fn).mockResolvedValue({})
    setup('/settings/notifications')
    expect(await screen.findByText(/Tâche en échec · dernier envoi : 204/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Activer le webhook Discord' }))
    expect(webhooksApi.toggle).toHaveBeenCalledWith('w1', expect.anything())

    await userEvent.click(screen.getByRole('button', { name: 'Actions sur le webhook Discord' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Envoyer un test' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Test envoyé'))

    await userEvent.click(screen.getByRole('button', { name: 'Actions sur le webhook Discord' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer le webhook « Discord » ?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le webhook' }))
    expect(webhooksApi.remove).toHaveBeenCalledWith('w1', expect.anything())
  })

  it('creates an ntfy webhook with its credentials', async () => {
    vi.mocked(webhooksApi.list).mockResolvedValue([])
    vi.mocked(webhooksApi.create).mockResolvedValue({})
    setup('/settings/notifications')
    expect(await screen.findByText('Aucun webhook')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau webhook' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouveau webhook' })
    await userEvent.type(within(sheet).getByLabelText('Nom'), 'Téléphone')
    await userEvent.type(within(sheet).getByLabelText('URL'), 'https://ntfy.sh/nid')
    await userEvent.selectOptions(within(sheet).getByLabelText('Type'), 'ntfy')
    await userEvent.type(within(sheet).getByLabelText('Utilisateur ntfy (facultatif)'), 'ana')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Créer' }))
    expect(toast.error).toHaveBeenCalledWith('Choisissez au moins un événement')
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Tâche en échec' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Créer' }))
    expect(webhooksApi.create).toHaveBeenCalledWith(
      { name: 'Téléphone', url: 'https://ntfy.sh/nid', type: 'ntfy', events: ['job.failed'], auth_user: 'ana', auth_password: undefined },
      expect.anything(),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Données', () => {
  const pick = (button: HTMLElement, file: File) => userEvent.upload(button.previousElementSibling as HTMLInputElement, file)

  it('imports an mbox file and an IMAP mailbox into the active account', async () => {
    vi.mocked(importApi.importMbox).mockResolvedValue({ jobId: 'j1' })
    vi.mocked(importApi.importImap).mockResolvedValue({ jobId: 'j2' })
    setup('/settings/data')
    const file = new File(['From x'], 'takeout.mbox')
    await pick(screen.getByRole('button', { name: 'Choisir un fichier .mbox' }), file)
    expect(importApi.importMbox).toHaveBeenCalledWith('acc-1', file)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Import lancé — suivi dans Activité', expect.anything()))

    await userEvent.type(screen.getByLabelText('Serveur'), 'imap.example.com')
    await userEvent.type(screen.getByLabelText('Identifiant'), 'ana')
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: "Lancer l'import" }))
    expect(importApi.importImap).toHaveBeenCalledWith('acc-1', {
      host: 'imap.example.com', port: 993, secure: true, user: 'ana', pass: 'secret', folder: undefined, maxMessages: undefined,
    })
  })

  it('exports the archives and the configuration, and imports a configuration', async () => {
    vi.mocked(importApi.exportMbox).mockResolvedValue(new Blob(['mbox']))
    vi.mocked(configApi.exportConfig).mockResolvedValue({ rules: [] })
    vi.mocked(configApi.importConfig).mockResolvedValue({ ok: true })
    setup('/settings/data')
    await userEvent.click(screen.getByRole('button', { name: 'Exporter (.mbox)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Exporter la configuration' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(2))

    await pick(screen.getByRole('button', { name: 'Importer une configuration' }), new File(['{"rules":[]}'], 'nid.json', { type: 'application/json' }))
    await waitFor(() => expect(configApi.importConfig).toHaveBeenCalledWith({ rules: [] }, expect.anything()))
    await pick(screen.getByRole('button', { name: 'Importer une configuration' }), new File(['not json'], 'bad.json', { type: 'application/json' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ce fichier n'est pas une configuration Nid valide"))
  })

  it('asks for a Gmail account before mail import/export', () => {
    useAuthStore.setState({ gmailAccounts: [], activeAccountId: null })
    setup('/settings/data')
    expect(screen.getByRole('link', { name: 'Ajouter un compte Gmail' })).toHaveAttribute('href', '/settings/gmail')
    expect(screen.getByRole('button', { name: 'Exporter la configuration' })).toBeInTheDocument()
  })
})
