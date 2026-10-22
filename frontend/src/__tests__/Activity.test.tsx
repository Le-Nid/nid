import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { toast } from 'sonner'
import i18n from '../i18n'
import { jobsApi } from '../api'
import { useAuthStore } from '../store/auth.store'
import type { LiveCounters } from '../hooks/useLiveCounters'

vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: 'acc-1', account: null }) }))
vi.mock('../api', () => ({ jobsApi: { list: vi.fn(), cancel: vi.fn(), retry: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ jobId, label, onDone }: { jobId: string; label: string; onDone: () => void }) => (
    <button type="button" onClick={onDone}>progress {jobId} {label}</button>
  ),
}))

import ActivityPage from '../pages/Activity'

const job = (over: Record<string, unknown>) => ({
  bullmq_id: null, processed: 0, gmail_account_id: 'acc-1', payload: null, error: null,
  created_at: '2026-10-21T08:00:00Z', completed_at: null, ...over,
})
const JOBS = [
  job({ id: 'j1', type: 'archive_mails', status: 'completed', processed: 10, completed_at: '2026-10-21T08:01:05Z' }),
  job({ id: 'j2', type: 'bulk_operation', status: 'scheduled', payload: { senderEmail: 'digest@news.test' } }),
  job({ id: 'j3', type: 'archive_mails', status: 'failed', error: 'NAS injoignable', payload: { retryOf: 'j0' } }),
  job({ id: 'j4', type: 'backfill_body_text', status: 'completed', gmail_account_id: null, completed_at: '2026-10-21T08:00:12Z' }),
  job({ id: 'j5', type: 'run_rule', status: 'active', bullmq_id: 'run_rule-5', payload: { ruleId: 'r1' } }),
  job({ id: 'j6', type: 'scan_pii', status: 'cancelled', payload: { query: 'from:x' } }),
]
const COUNTS = { completed: 30, scheduled: 1, failed: 1, active: 1, cancelled: 1 }

function setup(path = '/activity', counters: LiveCounters | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ element: <Outlet context={counters} />, children: [{ path: '/activity', element: <ActivityPage /> }] }],
    { initialEntries: [path] },
  )
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, client, view }
}
const user = () => userEvent.setup()
const row = async (text: string) => (await screen.findByText(text)).closest('tr')!
const lastParams = () => vi.mocked(jobsApi.list).mock.lastCall![0]

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ gmailAccounts: [{ id: 'acc-1', email: 'ana@gmail.com' }, { id: 'acc-2', email: 'bob@gmail.com' }] } as never)
  vi.mocked(jobsApi.list).mockResolvedValue({ jobs: JOBS, counts: COUNTS })
  vi.mocked(jobsApi.cancel).mockResolvedValue(undefined)
  vi.mocked(jobsApi.retry).mockResolvedValue({ jobId: 'new', retryOf: 'j3' })
})

describe('ActivityPage (/activity, §7.6)', () => {
  it('lists the jobs of the current account with labels, context, results and durations', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Activité' })).toBeInTheDocument()
    expect(lastParams()).toEqual({ accountId: 'acc-1', status: undefined, limit: 50, withCounts: true })
    const nas = await row('NAS injoignable')
    expect(within(nas).getByText('Archivage NAS')).toBeInTheDocument()
    expect(within(nas).getByText(/ana@gmail\.com · Relance/)).toBeInTheDocument()
    expect(within(await row('Indexation du texte des archives')).getByText(/^Instance · /)).toBeInTheDocument()
    expect(within(await row('Opération groupée')).getByText(/Nettoyage › digest@news\.test/)).toBeInTheDocument()
    expect(within(await row('Analyse des données personnelles')).getByText(/Mails › from:x/)).toBeInTheDocument()
    expect(screen.getByText(/Terminé · 10 mails traités/)).toBeInTheDocument()
    expect(screen.getByText(/1\s*min/)).toBeInTheDocument()
    expect(screen.getByText(/12\s*s/)).toBeInTheDocument()
    expect(screen.getByText('Arrêté')).toBeInTheDocument()
    expect(screen.getByText('En attente…')).toBeInTheDocument()
  })

  it('shows the counts on the chips and filters through the URL', async () => {
    const { router } = setup()
    const failed = await screen.findByRole('button', { name: /Échouées\s*1/ })
    expect(screen.getByRole('button', { name: /Toutes\s*34/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /En attente\s*1/ })).toBeInTheDocument()
    await user().click(failed)
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'failed' }))
    expect(router.state.location.search).toBe('?status=failed')
    await user().click(screen.getByRole('button', { name: /En attente/ }))
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'scheduled,pending' }))
  })

  it('reads the chip and the account from the URL; « Tous les comptes » drops the account filter', async () => {
    setup('/activity?status=completed&account=acc-2')
    await waitFor(() => expect(lastParams()).toEqual({ accountId: 'acc-2', status: 'completed', limit: 50, withCounts: true }))
    await user().selectOptions(screen.getByLabelText('Compte Gmail'), 'Tous les comptes')
    await waitFor(() => expect(lastParams()).toMatchObject({ accountId: undefined, status: 'completed' }))
  })

  it('ignores an unknown chip', async () => {
    setup('/activity?status=toString')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: undefined }))
  })

  it('« N sur M » and « Afficher plus » load the next page', async () => {
    setup()
    expect(await screen.findByText('6 sur 34 · historique conservé 30 jours')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Afficher plus' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ limit: 100 }))
  })

  it('cancels a scheduled job', async () => {
    setup()
    await user().click(within(await row('Opération groupée')).getByRole('button', { name: 'Annuler : Opération groupée' }))
    expect(jobsApi.cancel).toHaveBeenCalledWith('j2')
    await waitFor(() => expect(jobsApi.list).toHaveBeenCalledTimes(2))
  })

  it('tells when the cancel fails', async () => {
    vi.mocked(jobsApi.cancel).mockRejectedValueOnce(new Error('409'))
    setup()
    await user().click(within(await row('Opération groupée')).getByRole('button', { name: /Annuler/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'annuler la tâche"))
  })

  it('retries a failed job', async () => {
    setup()
    await user().click(within(await row('NAS injoignable')).getByRole('button', { name: 'Relancer : Archivage NAS' }))
    expect(jobsApi.retry).toHaveBeenCalledWith('j3')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tâche relancée'))
  })

  it('explains a retry refused for missing credentials, and other failures', async () => {
    const conflict = new AxiosError('409', '409', undefined, undefined, { status: 409, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } })
    vi.mocked(jobsApi.retry).mockRejectedValueOnce(conflict).mockRejectedValueOnce(new Error('500'))
    setup()
    const retry = within(await row('NAS injoignable')).getByRole('button', { name: /Relancer/ })
    await user().click(retry)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/identifiants non conservés/)))
    await user().click(retry)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de relancer la tâche'))
  })

  it('opens the details of a failed job', async () => {
    setup()
    await user().click(within(await row('NAS injoignable')).getByRole('button', { name: 'Détails : Archivage NAS' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archivage NAS' })
    expect(within(dialog).getByText('NAS injoignable')).toBeInTheDocument()
    expect(within(dialog).getByText(/^Échoué · Lancée/)).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('« Voir » links a finished job to its page, else opens its details', async () => {
    setup()
    expect(within(await row('Terminé · 10 mails traités')).getByRole('link', { name: 'Voir : Archivage NAS' })).toHaveAttribute('href', '/archives')
    await user().click(within(await row('Indexation du texte des archives')).getByRole('button', { name: /Détails/ }))
    expect(await screen.findByText("Aucun détail d'erreur.")).toBeInTheDocument()
  })

  it('shows the live progress of a running job and refreshes when it ends', async () => {
    setup()
    const progress = await screen.findByRole('button', { name: 'progress run_rule-5 Règle auto' })
    expect(within(progress.closest('tr')!).getByText(/· Règle ·/)).toBeInTheDocument()
    await user().click(progress)
    await waitFor(() => expect(jobsApi.list).toHaveBeenCalledTimes(2))
  })

  it('refreshes when the live counter of running jobs moves', async () => {
    const counters = (activeJobs: number): LiveCounters => ({ mails: {}, activeRules: 0, activeJobs })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const routes = (c: LiveCounters) => [{ element: <Outlet context={c} />, children: [{ path: '/activity', element: <ActivityPage /> }] }]
    const ui = (c: LiveCounters) => (
      <QueryClientProvider client={client}><RouterProvider router={createMemoryRouter(routes(c), { initialEntries: ['/activity'] })} /></QueryClientProvider>
    )
    const { rerender } = render(ui(counters(1)))
    await screen.findByText('NAS injoignable')
    const before = vi.mocked(jobsApi.list).mock.calls.length
    await act(async () => rerender(ui(counters(2))))
    await waitFor(() => expect(vi.mocked(jobsApi.list).mock.calls.length).toBeGreaterThan(before))
  })

  it('shows an empty state without a footer', async () => {
    vi.mocked(jobsApi.list).mockResolvedValue({ jobs: [], counts: {} })
    setup()
    expect(await screen.findByText('Aucune tâche')).toBeInTheDocument()
    expect(screen.queryByText(/historique conservé/)).not.toBeInTheDocument()
  })

  it('shows a load error with « Réessayer »', async () => {
    vi.mocked(jobsApi.list).mockRejectedValueOnce(new Error('500'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent("Impossible de charger l'activité")
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('NAS injoignable')).toBeInTheDocument()
  })
})
