import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import { TooltipProvider } from '../components/ui/tooltip'
import { archiveApi, attachmentsApi, gmailApi, jobsApi, rulesApi, unsubscribeApi } from '../api'
import { showUndoToast } from '../components/app/UndoToast'
import type { JobState } from '../hooks/useJobSSE'

const account = vi.hoisted(() => ({ id: 'acc-1' as string | null }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: account.id }) }))
vi.mock('../api', () => ({
  unsubscribeApi: { getNewsletters: vi.fn(), scanAsync: vi.fn(), deleteSender: vi.fn() },
  attachmentsApi: {
    listLive: vi.fn(), listArchived: vi.fn(),
    downloadLiveUrl: (a: string, m: string, f: string) => `/live/${a}/${m}/${f}`,
    downloadArchivedUrl: (a: string, id: string) => `/archived/${a}/${id}`,
  },
  rulesApi: { preview: vi.fn(), create: vi.fn() },
  gmailApi: { bulkOperation: vi.fn() },
  archiveApi: { triggerArchive: vi.fn() },
  jobsApi: { cancel: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ jobId, label, onDone }: { jobId: string; label: string; onDone: (j: Partial<JobState>) => void }) => (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => onDone({ id: jobId, status: 'completed' })}>finish {jobId}</button>
      <button type="button" onClick={() => onDone({ id: jobId, status: 'failed' })}>fail {jobId}</button>
    </div>
  ),
}))

import CleanupPage from '../pages/Cleanup'

const sender = (email: string, patch = {}) => ({
  sender: `${email.split('@')[0]} <${email}>`, email, count: 3, totalSizeBytes: 1024, unreadCount: 1,
  unsubscribeUrl: null, unsubscribeMailto: null, latestDate: '', ...patch,
})
const DIGEST = sender('digest@news.test', { count: 12, totalSizeBytes: 4 * 1024 * 1024, unreadCount: 2, unsubscribeUrl: 'https://news.test/u' })
const LIST = sender('list@groups.test', { count: 40, totalSizeBytes: 2048, unreadCount: 30 })
const MAILTO = sender('promo@shop.test', { count: 5, totalSizeBytes: 8 * 1024 * 1024, unreadCount: 0, unsubscribeMailto: 'mailto:stop@shop.test' })
const SCAN = { senders: [DIGEST, LIST, MAILTO], scannedAt: '2026-10-20T08:00:00Z' }

let mobile = false
function setup(url = '/cleanup') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const router = createMemoryRouter([{ path: '/cleanup', element: <CleanupPage /> }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><TooltipProvider><RouterProvider router={router} /></TooltipProvider></QueryClientProvider>)
  return { router, invalidate }
}
const user = () => userEvent.setup()
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent?.slice(1)) // first char = avatar initial

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  account.id = 'acc-1'
  mobile = false
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false,
    media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue(SCAN)
  vi.mocked(unsubscribeApi.deleteSender).mockResolvedValue({ jobId: 'job-s', runAt: '', count: 12 })
  vi.mocked(jobsApi.cancel).mockResolvedValue({})
  vi.mocked(rulesApi.preview).mockResolvedValue({ query: 'from:x', estimatedCount: 7 })
  vi.mocked(rulesApi.create).mockResolvedValue({ id: 'r1' })
  vi.mocked(attachmentsApi.listLive).mockResolvedValue({
    attachments: [
      { messageId: 'm1', filename: 'video.mp4', sizeBytes: 9_000_000, mailSubject: 'Vidéos', mailSender: 'Marie <m@x.test>', mailDate: '2026-08-02T10:00:00Z' },
      { messageId: 'm1', filename: 'photo.jpg', sizeBytes: 1_000_000, mailSubject: 'Vidéos', mailSender: 'Marie <m@x.test>', mailDate: 'nope' },
      { messageId: 'm2', filename: 'devis.pdf', sizeBytes: 500_000, mailSubject: '', mailSender: 'a@x.test', mailDate: '2026-09-01T10:00:00Z' },
    ],
    totalSizeBytes: 10_500_000,
  })
  vi.mocked(attachmentsApi.listArchived).mockResolvedValue({
    attachments: [{ id: 'att1', filename: 'contrat.pdf', size_bytes: '102400', mail_subject: null, mail_sender: null, mail_date: null }],
    totalSizeBytes: 102400,
  })
  vi.mocked(gmailApi.bulkOperation).mockResolvedValue({ jobId: 'job-bulk' })
  vi.mocked(archiveApi.triggerArchive).mockResolvedValue({ jobId: 'job-nas' })
  vi.spyOn(window, 'open').mockReturnValue(null)
})

describe('Cleanup — senders', () => {
  it('reads the cached scan: summary, rows sorted by count, scan date', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Nettoyage' })).toBeInTheDocument()
    expect(await screen.findByText(/12 Mo récupérables\. Les 3 premiers expéditeurs pèsent 12 Mo\./)).toBeInTheDocument()
    expect(names()).toEqual(['list', 'digest', 'promo'])
    expect(screen.getByText(/Analyse du/)).toBeInTheDocument()
    expect(unsubscribeApi.scanAsync).not.toHaveBeenCalled()
  })

  it('sorts by size or never opened, and filters newsletters, through the URL', async () => {
    const { router } = setup()
    await rowOf('list')
    await user().click(screen.getByRole('button', { name: 'Taille' }))
    await waitFor(() => expect(names()).toEqual(['promo', 'digest', 'list']))
    expect(router.state.location.search).toBe('?sort=size')
    await user().click(screen.getByRole('button', { name: 'Jamais ouverts' }))
    await waitFor(() => expect(names()).toEqual(['list', 'digest', 'promo']))
    expect(screen.getByRole('button', { name: 'Jamais ouverts' })).toHaveAttribute('aria-pressed', 'true')

    await user().click(screen.getByRole('checkbox', { name: /Newsletters uniquement/ }))
    await waitFor(() => expect(names()).toEqual(['digest', 'promo']))
    await user().click(screen.getByRole('button', { name: 'Nombre de mails' }))
    await waitFor(() => expect(router.state.location.search).toBe('?only=newsletters'))
  })

  it('newsletter filter with no match offers to show every sender', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue({ senders: [LIST], scannedAt: SCAN.scannedAt })
    setup('/cleanup?only=newsletters')
    await user().click(await screen.findByRole('button', { name: 'Afficher tous les expéditeurs' }))
    expect(await screen.findByText('list')).toBeInTheDocument()
  })

  it('shows an empty state when the scan found nothing', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue({ senders: [], scannedAt: SCAN.scannedAt })
    setup()
    expect(await screen.findByText('Aucun expéditeur à nettoyer')).toBeInTheDocument()
  })

  it('never scanned: « Analyser la boîte » runs the scan job, then reloads the cache', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue({ senders: [], scannedAt: null })
    vi.mocked(unsubscribeApi.scanAsync).mockResolvedValue({ jobId: 'job-scan' })
    const { invalidate } = setup()
    await user().click(await screen.findByRole('button', { name: 'Analyser la boîte' }))
    expect(unsubscribeApi.scanAsync).toHaveBeenCalledWith('acc-1')
    expect(await screen.findByText('Analyse des expéditeurs')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'fail job-scan' }))
    expect(toast.error).toHaveBeenCalledWith("L'analyse des expéditeurs a échoué")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['unsubscribe', 'acc-1'] })
  })

  it('rescan failure is reported', async () => {
    vi.mocked(unsubscribeApi.scanAsync).mockRejectedValue(new Error('down'))
    setup()
    await user().click(await screen.findByRole('button', { name: "Relancer l'analyse" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L'analyse des expéditeurs a échoué"))
  })

  it('load error offers a retry', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les expéditeurs')
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue(SCAN)
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('digest')).toBeInTheDocument()
  })

  it('unsubscribe: confirm dialog (D2), opens the link, trashes with undo, progress in the row', async () => {
    const { invalidate } = setup()
    const row = await rowOf('digest')
    await user().click(within(row).getByRole('button', { name: 'Se désabonner et nettoyer' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Se désabonner de digest ?' })
    await user().click(within(dialog).getByRole('button', { name: 'Se désabonner et supprimer 12 mails' }))

    expect(window.open).toHaveBeenCalledWith('https://news.test/u', '_blank', 'noopener,noreferrer')
    expect(unsubscribeApi.deleteSender).toHaveBeenCalledWith('acc-1', 'digest@news.test')
    expect(await screen.findByText('Désabonné · suppression de 12 mails de digest')).toBeInTheDocument()
    expect(showUndoToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Suppression de 12 mails' }))
    // Busy row: its actions are gone until the job ends
    expect(within(await rowOf('Désabonné · suppression de 12 mails de digest')).queryByRole('button', { name: 'Tout supprimer' })).toBeNull()

    await user().click(screen.getByRole('button', { name: 'finish job-s' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['unsubscribe', 'acc-1'] })
    await waitFor(() => expect(screen.queryByText(/Désabonné/)).toBeNull())
  })

  it('mailto unsubscribe opens the mail client link', async () => {
    setup()
    await user().click(within(await rowOf('promo')).getByRole('button', { name: 'Se désabonner et nettoyer' }))
    await user().click(screen.getByRole('button', { name: 'Se désabonner et supprimer 5 mails' }))
    expect(window.open).toHaveBeenCalledWith('mailto:stop@shop.test', '_blank', 'noopener,noreferrer')
  })

  it('« Tout supprimer »: no dialog, undo cancels the delayed job', async () => {
    setup()
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Tout supprimer' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(await screen.findByText('Suppression de 12 mails de digest')).toBeInTheDocument()
    vi.mocked(showUndoToast).mock.calls[0][0].onUndo()
    await waitFor(() => expect(jobsApi.cancel).toHaveBeenCalledWith('job-s'))
    await waitFor(() => expect(screen.queryByText('Suppression de 12 mails de digest')).toBeNull())
  })

  it('undo failure and job failure are reported', async () => {
    vi.mocked(jobsApi.cancel).mockRejectedValue(new Error('gone'))
    setup()
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Tout supprimer' }))
    await screen.findByText('Suppression de 12 mails de digest')
    vi.mocked(showUndoToast).mock.calls[0][0].onUndo()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(i18n.t('mails.undoFailed')))
    await user().click(screen.getByRole('button', { name: 'fail job-s' }))
    expect(toast.error).toHaveBeenCalledWith(i18n.t('mails.jobFailed'))
  })

  it('delete failure restores the row actions; nothing left in Gmail just refreshes', async () => {
    vi.mocked(unsubscribeApi.deleteSender).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ deleted: 0 })
    const { invalidate } = setup()
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Tout supprimer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(i18n.t('mails.actionFailed')))
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Tout supprimer' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['unsubscribe', 'acc-1'] }))
    expect(showUndoToast).not.toHaveBeenCalled()
  })

  it('D3: no List-Unsubscribe → disabled button explained, other actions active', async () => {
    setup()
    const row = await rowOf('list')
    const button = within(row).getByRole('button', { name: 'Se désabonner et nettoyer' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Cet expéditeur ne propose pas de désabonnement automatique')
    await user().click(button)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(within(row).getByRole('button', { name: 'Tout supprimer' })).toBeEnabled()
  })

  it('« Toujours faire ça »: rule sheet with preview, creates a daily trash rule', async () => {
    const { invalidate } = setup()
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Toujours faire ça' }))
    const sheet = screen.getByRole('dialog', { name: 'Toujours supprimer les mails de digest' })
    expect(await within(sheet).findByText(/7 mails correspondent/)).toBeInTheDocument()
    expect(rulesApi.preview).toHaveBeenCalledWith('acc-1', [{ field: 'from', operator: 'contains', value: 'digest@news.test' }])
    const name = within(sheet).getByLabelText('Nom de la règle')
    expect(name).toHaveValue('Corbeille : digest')
    await user().clear(name)
    expect(within(sheet).getByRole('button', { name: 'Créer la règle' })).toBeDisabled()
    await user().type(name, 'Stop digest')
    await user().click(within(sheet).getByRole('button', { name: 'Créer la règle' }))
    await waitFor(() => expect(rulesApi.create).toHaveBeenCalledWith('acc-1', {
      name: 'Stop digest', conditions: [{ field: 'from', operator: 'contains', value: 'digest@news.test' }],
      action: { type: 'trash' }, schedule: 'daily', is_active: true,
    }))
    expect(toast.success).toHaveBeenCalledWith('Règle créée')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules', 'acc-1'] })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('rule sheet: preview and creation errors', async () => {
    vi.mocked(rulesApi.preview).mockRejectedValue(new Error('x'))
    vi.mocked(rulesApi.create).mockRejectedValue(new Error('x'))
    setup()
    await user().click(within(await rowOf('digest')).getByRole('button', { name: 'Toujours faire ça' }))
    const sheet = screen.getByRole('dialog')
    expect(await within(sheet).findByText('Aperçu indisponible')).toBeInTheDocument()
    await user().click(within(sheet).getByRole('button', { name: 'Créer la règle' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de créer la règle'))
    await user().click(within(sheet).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('mobile: cards, actions in a bottom sheet', async () => {
    mobile = true
    setup()
    await screen.findByText('digest')
    expect(screen.queryByRole('table')).toBeNull()
    await user().click(screen.getByRole('button', { name: 'Actions pour list' }))
    const sheet = screen.getByRole('dialog', { name: 'list' })
    expect(within(sheet).getByText('Cet expéditeur ne propose pas de désabonnement automatique')).toBeInTheDocument()
    await user().click(within(sheet).getByRole('button', { name: 'Tout supprimer' }))
    expect(unsubscribeApi.deleteSender).toHaveBeenCalledWith('acc-1', 'list@groups.test')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'list' })).toBeNull())

    await user().click(screen.getByRole('button', { name: 'Actions pour digest' }))
    await user().click(within(screen.getByRole('dialog', { name: 'digest' })).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('Cleanup — large mails & attachments', () => {
  it('lists Gmail attachments by size; saves to the NAS and trashes (undo) per mail', async () => {
    const { invalidate } = setup('/cleanup?tab=large')
    expect(await screen.findByText('video.mp4')).toBeInTheDocument()
    expect(screen.getByText('3 pièces jointes · 10 Mo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Télécharger devis.pdf' })).toHaveAttribute('href', '/live/acc-1/m2/devis.pdf')
    expect(attachmentsApi.listLive).toHaveBeenCalledWith('acc-1', { maxResults: 200 })

    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner video.mp4' }))
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner photo.jpg' }))
    await user().click(screen.getByRole('button', { name: i18n.t('mails.action.archive_nas') }))
    expect(archiveApi.triggerArchive).toHaveBeenCalledWith('acc-1', { messageIds: ['m1'], differential: true })

    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner devis.pdf' }))
    await user().click(screen.getByRole('button', { name: i18n.t('mails.action.trash') }))
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'trash', labelId: undefined, messageIds: ['m2'] })
    await waitFor(() => expect(screen.queryByText('devis.pdf')).toBeNull())
    expect(showUndoToast).toHaveBeenCalled()
    await user().click(await screen.findByRole('button', { name: 'finish job-bulk' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attachments', 'acc-1', 'live', { maxResults: 200 }] })
  })

  it('archived source: download only, no selection; switching tabs resets the URL', async () => {
    const { router } = setup('/cleanup?tab=large')
    await screen.findByText('video.mp4')
    await user().click(screen.getByRole('button', { name: 'Archives (NAS)' }))
    expect(await screen.findByText('contrat.pdf')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tab=large&source=archived')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Télécharger contrat.pdf' })).toHaveAttribute('href', '/archived/acc-1/att1')
    await user().click(screen.getByRole('button', { name: 'Gmail' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tab=large'))

    await user().click(screen.getByRole('tab', { name: 'Expéditeurs & newsletters' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('empty state', async () => {
    vi.mocked(attachmentsApi.listLive).mockResolvedValueOnce({ attachments: [], totalSizeBytes: 0 })
    setup('/cleanup?tab=large')
    expect(await screen.findByText('Aucune pièce jointe volumineuse')).toBeInTheDocument()
  })

  it('load error offers a retry', async () => {
    vi.mocked(attachmentsApi.listLive).mockRejectedValue(new Error('x'))
    setup('/cleanup?tab=large')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les pièces jointes')
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(attachmentsApi.listLive).toHaveBeenCalledTimes(2))
  })
})

it('without a Gmail account: empty state, no request', async () => {
  account.id = null
  setup()
  expect(await screen.findByText('Aucun compte Gmail connecté')).toBeInTheDocument()
  expect(unsubscribeApi.getNewsletters).not.toHaveBeenCalled()
})
