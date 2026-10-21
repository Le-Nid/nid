import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import { TooltipProvider } from '../components/ui/tooltip'
import { analyticsApi, dashboardApi, jobsApi, labelsApi, rulesApi, unsubscribeApi } from '../api'
import { useAuthStore } from '../store/auth.store'
import type { LiveCounters } from '../hooks/useLiveCounters'
import type { JobState } from '../hooks/useJobSSE'

const account = vi.hoisted(() => ({ id: 'acc-1' as string | null }))
vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: account.id, account: account.id ? { id: account.id, email: 'ana@gmail.com' } : null }),
}))
vi.mock('../api', () => ({
  dashboardApi: { getStats: vi.fn(), getArchiveStats: vi.fn() },
  unsubscribeApi: { getNewsletters: vi.fn(), deleteSender: vi.fn() },
  rulesApi: { getStats: vi.fn(), preview: vi.fn(), create: vi.fn() },
  analyticsApi: { getCleanupSuggestions: vi.fn(), dismissSuggestion: vi.fn() },
  jobsApi: { list: vi.fn(), cancel: vi.fn() },
  labelsApi: { list: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ jobId, label, onDone }: { jobId: string; label: string; onDone: (j: Partial<JobState>) => void }) => (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => onDone({ id: jobId, status: 'completed' })}>finish {jobId}</button>
    </div>
  ),
}))

import OverviewPage from '../pages/Overview'

const STATS = {
  totalMessages: 1234, unreadCount: 56,
  bySender: [
    { sender: 'Shop <promo@shop.test>', count: 40, sizeBytes: 2 * 1024 * 1024 },
    { sender: 'Digest <digest@news.test>', count: 120, sizeBytes: 5 * 1024 * 1024 },
  ],
}
const DIGEST = {
  sender: 'Digest <digest@news.test>', email: 'digest@news.test', count: 12, totalSizeBytes: 4 * 1024 * 1024, unreadCount: 2,
  unsubscribeUrl: 'https://news.test/u', unsubscribeMailto: null, latestDate: '',
}
const SCAN = { senders: [DIGEST, { ...DIGEST, email: 'x@y.test', totalSizeBytes: 1024 * 1024, unsubscribeUrl: null }], scannedAt: '2026-10-20T08:00:00Z' }
const SUGGESTIONS = [
  { id: 's1', type: 'old_newsletters', title: '', sender: 'Digest <digest@news.test>', emailCount: 12, totalSizeBytes: 4 * 1024 * 1024 },
  { id: 's2', type: 'bulk_unread', title: '', sender: 'Bank <info@bank.test>', emailCount: 30, totalSizeBytes: 1024 },
]

function setup(counters: LiveCounters | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ element: <Outlet context={counters} />, children: [{ path: '/overview', element: <OverviewPage /> }] }],
    { initialEntries: ['/overview'] },
  )
  render(<QueryClientProvider client={client}><TooltipProvider><RouterProvider router={router} /></TooltipProvider></QueryClientProvider>)
  return { router }
}
const user = () => userEvent.setup()
const kpi = (name: RegExp) => screen.findByRole('link', { name })
const suggestion = async (text: string) => (await screen.findByText(text)).closest('li')!

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  account.id = 'acc-1'
  useAuthStore.setState({ user: { id: 'u1', email: 'ana@example.com', role: 'user', display_name: 'Ana' } })
  vi.mocked(dashboardApi.getStats).mockResolvedValue(STATS)
  vi.mocked(dashboardApi.getArchiveStats).mockResolvedValue({ total_mails: 617, total_size: 1024, last_archived_at: null })
  vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue(SCAN)
  vi.mocked(unsubscribeApi.deleteSender).mockResolvedValue({ jobId: 'job-s', runAt: '', count: 12 })
  vi.mocked(rulesApi.getStats).mockResolvedValue({ active: 3, processed30d: 1284 })
  vi.mocked(rulesApi.preview).mockResolvedValue({ query: 'from:x', estimatedCount: 0, sizeBytes: 0, samples: [] })
  vi.mocked(labelsApi.list).mockResolvedValue([])
  vi.mocked(analyticsApi.getCleanupSuggestions).mockResolvedValue(SUGGESTIONS)
  vi.mocked(analyticsApi.dismissSuggestion).mockResolvedValue({ ok: true })
  vi.mocked(jobsApi.list).mockResolvedValue([])
  vi.spyOn(window, 'open').mockReturnValue(null)
})

describe('OverviewPage', () => {
  it('greets the user and shows the account with its backup state', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Bonjour Ana' })).toBeInTheDocument()
    expect(await screen.findByText("ana@gmail.com · Aucune sauvegarde pour l'instant")).toBeInTheDocument()
  })

  it('4 KPI cards, each one link named by its label and figure', async () => {
    setup()
    expect(await kpi(/^Mails dans Gmail\s*1 234\s*56 non lus$/)).toHaveAttribute('href', '/mails')
    expect(await kpi(/^Récupérable\s*5 Mo\s*2 expéditeurs à nettoyer$/)).toHaveAttribute('href', '/cleanup')
    expect(await kpi(/^Sauvegarde NAS\s*50 %\s*617 mails$/)).toHaveAttribute('href', '/archives')
    expect(await kpi(/^Règles actives\s*3\s*1 284 mails traités ces 30 derniers jours$/)).toHaveAttribute('href', '/rules')
  })

  it('live counters (B3) win over the cached figures', async () => {
    setup({ mails: { 'acc-1': 48212 }, activeRules: 7, activeJobs: 0 })
    expect(await kpi(/^Mails dans Gmail\s*48 212/)).toBeInTheDocument()
    expect(await kpi(/^Règles actives\s*7/)).toBeInTheDocument()
  })

  it('never-scanned senders and missing figures read as « — », not as zero', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue({ senders: [], scannedAt: null })
    vi.mocked(dashboardApi.getStats).mockRejectedValue(new Error('down'))
    setup()
    expect(await kpi(/^Récupérable\s*—\s*Analyse des expéditeurs à lancer$/)).toBeInTheDocument()
    expect(await kpi(/^Mails dans Gmail\s*—$/)).toBeInTheDocument()
    expect(await kpi(/^Sauvegarde NAS\s*—\s*617 mails$/)).toBeInTheDocument()
  })

  it('top senders: by count, figures as text, error with retry', async () => {
    setup()
    const top = (await screen.findByRole('heading', { name: 'Top encombreurs' })).closest('section')!
    const items = await within(top).findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['Digest120 mails · 5 Mo', 'Shop40 mails · 2 Mo'])
    expect(within(top).getByRole('link', { name: 'Tout voir : Top encombreurs' })).toHaveAttribute('href', '/cleanup')
  })

  it('top senders load error offers a retry', async () => {
    vi.mocked(dashboardApi.getStats).mockRejectedValueOnce(new Error('down')).mockResolvedValue(STATS)
    setup()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Impossible de charger les statistiques du compte.')
    await user().click(within(alert).getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Digest')).toBeInTheDocument()
  })

  it('suggestion « Ignorer » dismisses it; a failure says so', async () => {
    setup()
    const item = await suggestion('Digest vous a envoyé 12 mails que vous lisez peu.')
    await user().click(within(item).getByRole('button', { name: 'Ignorer' }))
    await waitFor(() => expect(analyticsApi.dismissSuggestion).toHaveBeenCalledWith('s1'))

    vi.mocked(analyticsApi.dismissSuggestion).mockRejectedValueOnce(new Error('nope'))
    await user().click(within(await suggestion('Bank : 30 mails jamais lus (1 Ko).')).getByRole('button', { name: 'Ignorer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'ignorer cette suggestion."))
  })

  it('« Toujours faire ça » opens the rule sheet prefilled with the sender', async () => {
    setup()
    const item = await suggestion('Bank : 30 mails jamais lus (1 Ko).')
    await user().click(within(item).getByRole('button', { name: 'Toujours faire ça' }))
    expect(await screen.findByRole('dialog', { name: 'Nouvelle règle' })).toBeInTheDocument()
    await waitFor(() => expect(rulesApi.preview).toHaveBeenCalledWith('acc-1', [{ field: 'from', operator: 'contains', value: 'info@bank.test' }]))
  })

  it('« Se désabonner et nettoyer » as on Nettoyage, then the suggestion goes once the job is done', async () => {
    setup()
    const item = await suggestion('Digest vous a envoyé 12 mails que vous lisez peu.')
    await user().click(within(item).getByRole('button', { name: 'Se désabonner et nettoyer' }))
    await user().click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Se désabonner et supprimer 12 mails' }))
    expect(window.open).toHaveBeenCalledWith('https://news.test/u', '_blank', 'noopener,noreferrer')
    expect(unsubscribeApi.deleteSender).toHaveBeenCalledWith('acc-1', 'digest@news.test')
    await user().click(await within(item).findByRole('button', { name: 'finish job-s' }))
    await waitFor(() => expect(analyticsApi.dismissSuggestion).toHaveBeenCalledWith('s1'))
  })

  it('no List-Unsubscribe for the sender: the action is disabled with its reason (D3)', async () => {
    setup()
    const item = await suggestion('Bank : 30 mails jamais lus (1 Ko).')
    expect(within(item).getByRole('button', { name: 'Se désabonner et nettoyer' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('empty suggestions, top senders and jobs show their empty states', async () => {
    vi.mocked(analyticsApi.getCleanupSuggestions).mockResolvedValue([])
    vi.mocked(dashboardApi.getStats).mockResolvedValue({ ...STATS, bySender: [] })
    setup()
    expect(await screen.findByText("Aucune suggestion pour l'instant")).toBeInTheDocument()
    expect(await screen.findByText("Aucun expéditeur à afficher pour l'instant")).toBeInTheDocument()
    expect(await screen.findByText('Aucun job en cours')).toBeInTheDocument()
  })

  it('suggestions and jobs load errors offer a retry', async () => {
    vi.mocked(analyticsApi.getCleanupSuggestions).mockRejectedValue(new Error('x'))
    vi.mocked(jobsApi.list).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByText('Impossible de charger les suggestions.')).toBeInTheDocument()
    expect(await screen.findByText('Impossible de charger les jobs en cours.')).toBeInTheDocument()
  })

  it('running jobs with their progress, refreshed when one ends or the live count moves', async () => {
    vi.mocked(jobsApi.list).mockResolvedValue([{ id: 'j1', bullmq_id: 'run_rule-1', type: 'run_rule' }])
    setup({ mails: {}, activeRules: 0, activeJobs: 1 })
    expect(await screen.findByText('Règle auto')).toBeInTheDocument()
    expect(jobsApi.list).toHaveBeenCalledWith({ status: 'active' })
    const calls = vi.mocked(jobsApi.list).mock.calls.length
    await user().click(screen.getByRole('button', { name: 'finish run_rule-1' }))
    await waitFor(() => expect(vi.mocked(jobsApi.list).mock.calls.length).toBeGreaterThan(calls))
    const jobs = screen.getByRole('heading', { name: 'Jobs en cours' }).closest('section')!
    expect(within(jobs).getByRole('link', { name: 'Tout voir : Jobs en cours' })).toHaveAttribute('href', '/activity')
  })

  it('without a Gmail account: an empty state pointing to the settings', async () => {
    account.id = null
    setup()
    expect(screen.getByRole('link', { name: 'Connecter un compte Gmail' })).toHaveAttribute('href', '/settings/account')
    expect(dashboardApi.getStats).not.toHaveBeenCalled()
  })
})
