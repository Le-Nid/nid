import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import { adminApi, archiveApi, integrityApi } from '../api'

vi.mock('../api', () => ({
  adminApi: {
    listUsers: vi.fn(), updateUser: vi.fn(), listJobs: vi.fn(),
    getQuota: vi.fn(), listAudit: vi.fn(), getSystem: vi.fn(), emptyArchiveTrash: vi.fn(),
  },
  archiveApi: { updateTrashConfig: vi.fn() },
  integrityApi: { checkAsync: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ jobId, label, onDone }: { jobId: string; label: string; onDone: () => void }) => (
    <div>
      <span>{label}</span>
      <button type="button" onClick={onDone}>finish {jobId}</button>
    </div>
  ),
}))

import AdminPage from '../pages/Admin'

const GB = 1024 ** 3
const BOB = {
  id: 'u2', email: 'bob@example.com', display_name: null, role: 'user', is_active: true, max_gmail_accounts: 3,
  storage_quota_bytes: 5 * GB, storage_used_bytes: 1024 * 1024, gmail_accounts_count: 1, last_login_at: null,
}
const EVE = { ...BOB, id: 'u3', email: 'eve@example.com', role: 'admin', is_active: false, last_login_at: new Date().toISOString() }
const SYSTEM = {
  trash: { count: 2914, sizeBytes: 412 * 1024 * 1024, retentionDays: 30, purgeEnabled: true, nextPurgeAt: '2026-10-24T04:00:00Z' },
  integrity: { checkedAt: new Date().toISOString(), checkedFiles: 47108, missing: 0, corrupted: 0, orphaned: 0, healthy: true },
}
const QUOTA = { day: { units: 182_000, calls: 3, limit: 1_000_000_000 }, peakPerSecond: { units: 180, account: 'busy@gmail.com', limit: 250 }, rateLimited24h: 4 }
const LOGS = {
  logs: [
    { id: 'l1', user_email: 'bob@example.com', action: 'rule.create', target_type: 'rule', target_id: 'r1', created_at: '2026-10-20T08:00:00Z' },
    { id: 'l2', user_email: null, action: 'user.login', target_type: null, target_id: null, created_at: '2026-10-19T08:00:00Z' },
  ],
  total: 2, page: 1, limit: 20, actions: ['rule.create', 'user.login'],
}

function setup(path = '/admin') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/admin', element: <AdminPage /> }], { initialEntries: [path] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router }
}
const user = () => userEvent.setup()
const section = async (name: string) => (await screen.findByRole('heading', { level: 2, name })).closest('section')!

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.listUsers).mockResolvedValue({ users: [BOB, EVE], total: 2, page: 1, limit: 20 })
  vi.mocked(adminApi.updateUser).mockResolvedValue({})
  vi.mocked(adminApi.listJobs).mockResolvedValue({ jobs: [{ id: 'j1', type: 'archive_mails', status: 'active', user_email: 'bob@example.com', created_at: '2026-10-20T08:00:00Z' }], total: 1 })
  vi.mocked(adminApi.getQuota).mockResolvedValue(QUOTA)
  vi.mocked(adminApi.listAudit).mockResolvedValue(LOGS)
  vi.mocked(adminApi.getSystem).mockResolvedValue(SYSTEM)
  vi.mocked(adminApi.emptyArchiveTrash).mockResolvedValue({ deleted: 2914, sizeBytes: 1 })
  vi.mocked(archiveApi.updateTrashConfig).mockResolvedValue({ ok: true })
  vi.mocked(integrityApi.checkAsync).mockResolvedValue({ jobId: 'job-int' })
})

describe('AdminPage', () => {
  it('one h1 and the three tabs, Utilisateurs first', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument()
    const tabs = screen.getByRole('tablist', { name: "Sections de l'administration" })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Utilisateurs', 'Système', 'Audit'])
    expect(within(tabs).getByRole('tab', { name: 'Utilisateurs' })).toHaveAttribute('aria-selected', 'true')
  })

  it('the tab lives in the URL', async () => {
    const { router } = setup()
    await user().click(screen.getByRole('tab', { name: 'Audit' }))
    expect(router.state.location.search).toBe('?tab=audit')
    await user().click(screen.getByRole('tab', { name: 'Utilisateurs' }))
    expect(router.state.location.search).toBe('')
  })
})

describe('Utilisateurs', () => {
  it('lists role, status, accounts, storage and last login', async () => {
    setup()
    const bob = (await screen.findByText('bob@example.com')).closest('tr')!
    expect(bob).toHaveTextContent('Utilisateur')
    expect(bob).toHaveTextContent('Actif')
    expect(bob).toHaveTextContent('1 / 3 comptes')
    expect(bob).toHaveTextContent('1 Mo / 5 Go')
    expect(bob).toHaveTextContent('Jamais connecté')
    const eve = screen.getByText('eve@example.com').closest('tr')!
    expect(eve).toHaveTextContent('Admin')
    expect(eve).toHaveTextContent('Désactivé')
  })

  it('searches through the URL and the API', async () => {
    const { router } = setup()
    await user().type(await screen.findByRole('searchbox', { name: 'Rechercher un utilisateur' }), 'bo')
    await waitFor(() => expect(adminApi.listUsers).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'bo' }))
    expect(router.state.location.search).toBe('?q=bo')
  })

  it('edits a user in a sheet; an untouched quota is not resent', async () => {
    setup()
    await user().click(await screen.findByRole('button', { name: 'Modifier bob@example.com' }))
    const sheet = screen.getByRole('dialog', { name: "Modifier l'utilisateur" })
    await user().selectOptions(within(sheet).getByLabelText('Rôle'), 'admin')
    await user().click(within(sheet).getByRole('checkbox', { name: 'Compte actif' }))
    await user().clear(within(sheet).getByLabelText('Comptes Gmail maximum'))
    await user().type(within(sheet).getByLabelText('Comptes Gmail maximum'), '5')
    await user().click(within(sheet).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith('u2', { role: 'admin', is_active: false, max_gmail_accounts: 5 }))
    expect(toast.success).toHaveBeenCalledWith('Utilisateur mis à jour')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('sends a changed quota in bytes; a failure says so and keeps the sheet', async () => {
    vi.mocked(adminApi.updateUser).mockRejectedValueOnce(new Error('nope'))
    setup()
    await user().click(await screen.findByRole('button', { name: 'Modifier bob@example.com' }))
    const sheet = screen.getByRole('dialog')
    await user().clear(within(sheet).getByLabelText('Quota de stockage (Go)'))
    await user().type(within(sheet).getByLabelText('Quota de stockage (Go)'), '10')
    await user().click(within(sheet).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(adminApi.updateUser).toHaveBeenCalledWith('u2', expect.objectContaining({ storage_quota_bytes: 10 * GB })))
    expect(toast.error).toHaveBeenCalledWith('La mise à jour a échoué.')
    await user().click(within(sheet).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('pages through the users', async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue({ users: [BOB], total: 45, page: 1, limit: 20 })
    const { router } = setup()
    const pager = await screen.findByRole('navigation', { name: 'Pagination' })
    expect(pager).toHaveTextContent('Page 1 sur 3')
    expect(within(pager).getByRole('button', { name: 'Page précédente' })).toBeDisabled()
    await user().click(within(pager).getByRole('button', { name: 'Page suivante' }))
    await waitFor(() => expect(adminApi.listUsers).toHaveBeenLastCalledWith({ page: 2, limit: 20, search: undefined }))
    expect(router.state.location.search).toBe('?page=2')
  })

  it('empty list, no pager', async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValueOnce({ users: [], total: 0 })
    setup()
    expect(await screen.findByText('Aucun utilisateur')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('load error offers a retry', async () => {
    vi.mocked(adminApi.listUsers).mockRejectedValueOnce(new Error('down'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les utilisateurs.')
  })
})

describe('Système', () => {
  it('trash: volume, next purge, max duration', async () => {
    setup('/admin?tab=system')
    const trash = await section('Corbeille des archives')
    expect(within(trash).getByText(/^2\s914 mails · 412 Mo · prochaine purge le 24 octobre$/)).toBeInTheDocument()
    const select = within(trash).getByLabelText('Durée maximale dans la corbeille')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['7 jours', '30 jours', '90 jours'])
    await user().selectOptions(select, '90')
    await waitFor(() => expect(archiveApi.updateTrashConfig).toHaveBeenCalledWith({ retentionDays: 90 }))
    expect(toast.success).toHaveBeenCalledWith('Durée maximale enregistrée')
    await waitFor(() => expect(adminApi.getSystem).toHaveBeenCalledTimes(2))
  })

  it('keeps a custom duration selectable and says when the purge is off', async () => {
    vi.mocked(adminApi.getSystem).mockResolvedValue({ ...SYSTEM, trash: { ...SYSTEM.trash, retentionDays: 45, purgeEnabled: false, nextPurgeAt: null } })
    vi.mocked(archiveApi.updateTrashConfig).mockRejectedValueOnce(new Error('nope'))
    setup('/admin?tab=system')
    const trash = await section('Corbeille des archives')
    expect(within(trash).getByText(/purge automatique désactivée$/)).toBeInTheDocument()
    const select = within(trash).getByLabelText('Durée maximale dans la corbeille')
    expect(select).toHaveValue('45')
    await user().selectOptions(select, '7')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'enregistrer la durée."))
  })

  it('« Vider la corbeille maintenant… » confirms with the counts, then empties', async () => {
    setup('/admin?tab=system')
    const trash = await section('Corbeille des archives')
    await user().click(within(trash).getByRole('button', { name: 'Vider la corbeille maintenant…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Vider définitivement la corbeille ?' })
    expect(dialog).toHaveTextContent(/2\s914 mails \(412 Mo\) seront supprimés du NAS pour tous les utilisateurs/)
    await user().click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(adminApi.emptyArchiveTrash).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^2\s914 mails supprimés définitivement$/))
  })

  it('cancelling the confirmation empties nothing', async () => {
    setup('/admin?tab=system')
    const trash = await section('Corbeille des archives')
    await user().click(within(trash).getByRole('button', { name: 'Vider la corbeille maintenant…' }))
    await user().click(screen.getByRole('button', { name: 'Annuler' }))
    expect(adminApi.emptyArchiveTrash).not.toHaveBeenCalled()
  })

  it('a failed empty says so', async () => {
    vi.mocked(adminApi.emptyArchiveTrash).mockRejectedValueOnce(new Error('nope'))
    setup('/admin?tab=system')
    await user().click(within(await section('Corbeille des archives')).getByRole('button', { name: 'Vider la corbeille maintenant…' }))
    await user().click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de vider la corbeille.'))
  })

  it('integrity: state, last check, run a check that refreshes the state when done', async () => {
    setup('/admin?tab=system')
    const integrity = await section('Intégrité des archives')
    expect(within(integrity).getByText('Archives intègres')).toBeInTheDocument()
    expect(within(integrity).getByText(/^Dernier contrôle .* · 47\s108 mails vérifiés$/)).toBeInTheDocument()
    await user().click(within(integrity).getByRole('button', { name: 'Lancer un contrôle' }))
    expect(await within(integrity).findByText("Contrôle de l'intégrité")).toBeInTheDocument()
    expect(within(integrity).getByRole('button', { name: 'Lancer un contrôle' })).toBeDisabled()
    await user().click(within(integrity).getByRole('button', { name: 'finish job-int' }))
    await waitFor(() => expect(adminApi.getSystem).toHaveBeenCalledTimes(2))
    expect(within(integrity).getByRole('button', { name: 'Lancer un contrôle' })).toBeEnabled()
  })

  it('integrity: problems, orphans, failed start', async () => {
    vi.mocked(adminApi.getSystem).mockResolvedValueOnce({ ...SYSTEM, integrity: { ...SYSTEM.integrity, healthy: false, missing: 2, corrupted: 1, orphaned: 3 } })
    setup('/admin?tab=system')
    const integrity = await section('Intégrité des archives')
    expect(within(integrity).getByText('2 fichier(s) manquant(s), 1 corrompu(s)')).toBeInTheDocument()
    expect(within(integrity).getByText('3 fichier(s) orphelin(s) sur le NAS')).toBeInTheDocument()

    vi.mocked(integrityApi.checkAsync).mockRejectedValueOnce(new Error('nope'))
    await user().click(within(integrity).getByRole('button', { name: 'Lancer un contrôle' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Le contrôle n'a pas pu démarrer."))
  })

  it('integrity never checked; an empty trash has no button', async () => {
    vi.mocked(adminApi.getSystem).mockResolvedValue({ ...SYSTEM, trash: { ...SYSTEM.trash, count: 0 }, integrity: null })
    setup('/admin?tab=system')
    expect(within(await section('Intégrité des archives')).getByText('Aucun contrôle enregistré')).toBeInTheDocument()
    expect(within(await section('Corbeille des archives')).queryByRole('button', { name: 'Vider la corbeille maintenant…' })).not.toBeInTheDocument()
  })

  it('Gmail API quota of the instance', async () => {
    setup('/admin?tab=system')
    const quota = await section('Quota API Gmail')
    await waitFor(() => expect(within(quota).getByText(/^182\s000 \/ 1\s000\s000\s000$/)).toBeInTheDocument())
    expect(within(quota).getByText('180 / 250 u/s')).toBeInTheDocument()
    expect(within(quota).getByText('busy@gmail.com')).toBeInTheDocument()
    expect(within(quota).getByText('Réponses 429 sur 24 h').nextSibling).toHaveTextContent('4')
  })

  it('jobs of all users', async () => {
    setup('/admin?tab=system')
    const jobs = await section('Tâches de tous les utilisateurs')
    const row = (await within(jobs).findByText('archive_mails')).closest('tr')!
    expect(row).toHaveTextContent('bob@example.com')
    expect(row).toHaveTextContent('En cours')
  })

  it('load errors offer a retry', async () => {
    vi.mocked(adminApi.getSystem).mockRejectedValue(new Error('down'))
    vi.mocked(adminApi.getQuota).mockRejectedValue(new Error('down'))
    vi.mocked(adminApi.listJobs).mockRejectedValue(new Error('down'))
    setup('/admin?tab=system')
    await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      "Impossible de charger l'état de l'instance.Réessayer",
      'Impossible de charger le quota.Réessayer',
      'Impossible de charger les tâches.Réessayer',
    ]))
  })
})

describe('Audit', () => {
  it('lists the instance log, a deleted user included', async () => {
    setup('/admin?tab=audit')
    const table = await screen.findByRole('table')
    const row = (await within(table).findByText('rule.create')).closest('tr')!
    expect(row).toHaveTextContent('bob@example.com')
    expect(row).toHaveTextContent('rule · r1')
    expect(within(table).getByText('user.login').closest('tr')).toHaveTextContent('Utilisateur supprimé')
  })

  it('filters by user and action, through the URL', async () => {
    const { router } = setup('/admin?tab=audit')
    await user().type(await screen.findByLabelText('Utilisateur'), 'bob')
    await waitFor(() => expect(adminApi.listAudit).toHaveBeenLastCalledWith({ page: 1, limit: 20, user: 'bob', action: undefined }))
    await user().selectOptions(screen.getByLabelText('Action'), 'rule.create')
    await waitFor(() => expect(adminApi.listAudit).toHaveBeenLastCalledWith({ page: 1, limit: 20, user: 'bob', action: 'rule.create' }))
    expect(router.state.location.search).toBe('?tab=audit&user=bob&action=rule.create')
  })

  it('a filtered action from the URL stays selected; empty and error states', async () => {
    vi.mocked(adminApi.listAudit).mockResolvedValueOnce({ logs: [], total: 0, actions: [] })
    setup('/admin?tab=audit&action=gmail.connect')
    expect(await screen.findByText('Aucune entrée')).toBeInTheDocument()
    expect(screen.getByLabelText('Action')).toHaveValue('gmail.connect')
  })

  it('load error offers a retry', async () => {
    vi.mocked(adminApi.listAudit).mockRejectedValueOnce(new Error('down'))
    setup('/admin?tab=audit')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le journal.')
  })
})
