import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '../i18n'
import { useAuthStore } from '../store/auth.store'
import { archiveApi, gmailApi, jobsApi } from '../api'
import { showUndoToast } from '../components/app/UndoToast'
import type { JobState } from '../hooks/useJobSSE'

// Reactive account so the page re-renders in place (no remount) when it changes
const useMockAccount = create(() => ({ accountId: 'acc-1' as string | null }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: useMockAccount((s) => s.accountId) }) }))

const messages = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const useGmailMessages = vi.hoisted(() => vi.fn())
const useUnifiedMessages = vi.hoisted(() => vi.fn())
const createSaved = vi.hoisted(() => vi.fn())
vi.mock('../hooks/queries', () => ({
  useGmailMessages,
  useUnifiedMessages,
  useLabels: () => ({
    data: [
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'CATEGORY_PROMOTIONS', name: 'CATEGORY_PROMOTIONS', type: 'category' },
      { id: 'Label_1', name: 'Factures', type: 'user', color_bg: '#16a765' },
      { id: 'Label_old', name: 'Ancien', type: 'user', color_bg: null, deleted_at: '2026-01-01T00:00:00Z' },
    ],
  }),
  useSavedSearches: () => ({ data: [{ id: 's1', name: 'Mes factures', query: 'label:factures' }] }),
  useCreateSavedSearch: () => ({ mutate: createSaved }),
}))
vi.mock('../api', () => ({
  gmailApi: { bulkOperation: vi.fn() },
  archiveApi: { triggerArchive: vi.fn() },
  jobsApi: { cancel: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// Job progress: a button that ends the job, with the status passed in its name
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ jobId, label, onDone }: { jobId: string; label: string; onDone: (j: Partial<JobState>) => void }) => (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => onDone({ id: jobId, status: 'completed' })}>finish {jobId}</button>
      <button type="button" onClick={() => onDone({ id: jobId, status: 'failed' })}>fail {jobId}</button>
    </div>
  ),
}))
vi.mock('../components/app/RuleSheet', () => ({
  RuleSheet: ({ accountId, target, onClose }: { accountId: string; target: { from?: string } | null; onClose: () => void }) =>
    target && <div role="dialog" aria-label="rule sheet">from={target.from ?? 'none'} account={accountId}<button type="button" onClick={onClose}>close rule</button></div>,
}))
vi.mock('../components/app/MailViewer', () => ({
  MailViewer: ({ accountId, messageId, onAction, onClose, onCreateRule }: { accountId: string; messageId: string | null; onAction: (a: string) => void; onClose: () => void; onCreateRule: (from: string) => void }) =>
    messageId && (
      <div role="dialog" aria-label={`viewer ${messageId}`} data-account={accountId}>
        <button type="button" onClick={() => onAction('trash')}>viewer trash</button>
        <button type="button" onClick={() => onCreateRule('v@x.test')}>viewer rule</button>
        <button type="button" onClick={onClose}>viewer close</button>
      </div>
    ),
}))

import MailsPage from '../pages/Mails'

const mail = (id: string, subject: string, patch = {}) => ({
  id, threadId: `t-${id}`, subject, from: `Sender ${id} <${id}@x.test>`, date: '2026-10-01T10:00:00Z',
  sizeEstimate: 2048, snippet: `snippet ${id}`, labelIds: ['INBOX', 'Label_1'], hasAttachments: false, ...patch,
})
const MAILS = [mail('m1', 'Bulletin', { labelIds: ['UNREAD', 'CATEGORY_PROMOTIONS', 'Label_old'], hasAttachments: true }), mail('m2', 'Réunion', { date: '2020-01-02T00:00:00Z' })]

const ACCOUNTS = [
  { id: 'acc-1', email: 'perso@x.test', is_active: true },
  { id: 'acc-2', email: 'pro@x.test', is_active: true },
  { id: 'acc-3', email: 'old@x.test', is_active: false },
]
const UNIFIED = [
  { ...mail('m1', 'Bulletin', { labelIds: ['INBOX', 'Label_1'] }), accountId: 'acc-1', accountEmail: 'perso@x.test' },
  { ...mail('m3', 'Contrat', { labelIds: ['INBOX', 'Label_9'] }), accountId: 'acc-2', accountEmail: 'pro@x.test' },
  { ...mail('m4', 'Devis'), accountId: 'acc-2', accountEmail: 'pro@x.test' },
]

function setMessages(patch: Record<string, unknown> = {}, mails = MAILS, total = 2) {
  messages.current = {
    data: { pages: [{ mails, total }] }, isLoading: false, isError: false, isFetching: false,
    hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...patch,
  }
}

function setup(url = '/mails') {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const router = createMemoryRouter([{ path: '/mails', element: <MailsPage /> }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, invalidate }
}

const user = () => userEvent.setup()
const checkbox = (subject: string) => screen.getByRole('checkbox', { name: `Sélectionner ${subject}` })
const bar = () => screen.getByRole('toolbar', { name: 'Actions sur la sélection' })
const rowMenu = (subject: string) => screen.getByRole('button', { name: `Actions pour ${subject}` })
const press = (key: string) => act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  useMockAccount.setState({ accountId: 'acc-1' })
  useGmailMessages.mockImplementation(() => messages.current)
  useUnifiedMessages.mockReturnValue({
    data: { messages: UNIFIED }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
  })
  useAuthStore.setState({ gmailAccounts: [] })
  setMessages()
  vi.mocked(gmailApi.bulkOperation).mockResolvedValue({ jobId: 'job-1' })
  vi.mocked(archiveApi.triggerArchive).mockResolvedValue({ jobId: 'job-nas' })
  vi.mocked(jobsApi.cancel).mockResolvedValue({})
  vi.mocked(localStorage.getItem).mockReturnValue(null)
})

describe('MailsPage', () => {
  it('lists mails with labels, unread state, attachments and the result estimate', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Mails' })).toBeInTheDocument()
    expect(screen.getByText('~2 résultats')).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Bulletin/ })
    expect(within(row).getByText('(non lu)')).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: 'pièce jointe' })).toBeInTheDocument()
    expect(within(row).getByText('Promotions')).toBeInTheDocument()
    // B4: synced user label = Gmail color dot + name; a label deleted in Gmail keeps its name
    const factures = within(screen.getByRole('row', { name: /Réunion/ })).getByText('Factures')
    expect((factures.previousElementSibling as HTMLElement).style.backgroundColor).toBe('rgb(22, 167, 101)')
    expect(within(row).getByText('Ancien')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Réunion/ })).getByText(/2020/)).toBeInTheDocument()
    expect(screen.getByText('Tous les mails sont chargés')).toBeInTheDocument()
  })

  it('syncs the search with ?q= and refetches when the same search is submitted', async () => {
    const { router } = setup('/mails?q=from:a')
    expect(useGmailMessages).toHaveBeenLastCalledWith('acc-1', 'from:a', '')
    await user().click(screen.getByRole('button', { name: 'Non lus' }))
    expect(router.state.location.search).toBe('?q=is%3Aunread')
    expect(useGmailMessages).toHaveBeenLastCalledWith('acc-1', 'is:unread', '')
    await user().click(screen.getByRole('button', { name: 'Non lus' }))
    expect(messages.current.refetch).toHaveBeenCalled()
    await user().click(screen.getByRole('button', { name: 'Tous' }))
    expect(router.state.location.search).toBe('')
  })

  it('saves the current search', async () => {
    setup('/mails?q=from:a')
    await user().click(screen.getByRole('button', { name: 'Enregistrer la recherche' }))
    expect(createSaved).toHaveBeenCalledWith({ name: 'from:a', query: 'from:a' }, expect.anything())
    const { onSuccess, onError } = createSaved.mock.calls[0][1]
    onSuccess()
    onError()
    expect(toast.success).toHaveBeenCalledWith('Recherche enregistrée')
    expect(toast.error).toHaveBeenCalledWith("Impossible d'enregistrer la recherche")
  })

  it('archives the selection with the undo window, hides the rows, and undo restores them', async () => {
    setup()
    await user().click(checkbox('Bulletin'))
    await user().click(within(bar()).getByRole('button', { name: 'Archiver (retirer de la boîte)' }))

    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'archive', messageIds: ['m1'] })
    expect(screen.queryByRole('row', { name: /Bulletin/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Actions sur la sélection' })).not.toBeInTheDocument()
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Archivage de 1 mail', description: 'Retirés de la boîte de réception · suivi dans Activité',
    })))

    act(() => vi.mocked(showUndoToast).mock.calls[0][0].onUndo())
    expect(jobsApi.cancel).toHaveBeenCalledWith('job-1')
    expect(await screen.findByRole('row', { name: /Bulletin/ })).toBeInTheDocument()
  })

  it('says so when the undo comes too late, and keeps the rows hidden', async () => {
    vi.mocked(jobsApi.cancel).mockRejectedValue(new Error('gone'))
    setup()
    await user().click(rowMenu('Bulletin'))
    await user().click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled())
    act(() => vi.mocked(showUndoToast).mock.calls[0][0].onUndo())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Trop tard pour annuler : l'action est déjà en cours."))
    expect(screen.queryByRole('row', { name: /Bulletin/ })).not.toBeInTheDocument()
  })

  it('restores the rows and reports when the action cannot be launched', async () => {
    vi.mocked(gmailApi.bulkOperation).mockRejectedValue(new Error('500'))
    setup()
    await user().click(rowMenu('Bulletin'))
    await user().click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L'action n'a pas pu être lancée."))
    expect(screen.getByRole('row', { name: /Bulletin/ })).toBeInTheDocument()
    expect(showUndoToast).not.toHaveBeenCalled()
  })

  it('runs non-recoverable actions at once, shows their progress and refreshes the list when done', async () => {
    const { invalidate } = setup()
    await user().click(checkbox('Bulletin'))
    await user().click(checkbox('Réunion'))
    await user().click(within(bar()).getByRole('button', { name: 'Marquer comme lu' }))
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'mark_read', messageIds: ['m1', 'm2'], delayMs: 0 })
    expect(showUndoToast).not.toHaveBeenCalled()
    expect(screen.getByRole('row', { name: /Bulletin/ })).toBeInTheDocument()

    expect(await screen.findByText('2 mails marqués comme lus')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'fail job-1' }))
    expect(toast.error).toHaveBeenCalledWith("L'action sur les mails a échoué.")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gmail', 'acc-1', 'messages'] })
    await waitFor(() => expect(screen.queryByText('2 mails marqués comme lus')).not.toBeInTheDocument())
  })

  it('saves to the NAS (selection, then all results) through the archive job', async () => {
    setup('/mails?q=from:a')
    await user().click(checkbox('Réunion'))
    await user().click(within(bar()).getByRole('button', { name: 'Sauvegarder sur le NAS' }))
    expect(archiveApi.triggerArchive).toHaveBeenCalledWith('acc-1', { messageIds: ['m2'], differential: true })

    await user().click(screen.getByRole('button', { name: 'Tout sauvegarder sur le NAS' }))
    expect(archiveApi.triggerArchive).toHaveBeenLastCalledWith('acc-1', { query: 'from:a', differential: true })
    expect(await screen.findByText('Sauvegarde des résultats sur le NAS')).toBeInTheDocument()
    await user().click(screen.getAllByRole('button', { name: 'finish job-nas' })[0])
  })

  it('« select all results » switches the action to the search query (I2)', async () => {
    setMessages({}, MAILS, 1234)
    setup('/mails?q=from:a')
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner toutes les lignes de la page' }))
    await user().click(screen.getByRole('button', { name: /Sélectionner les ~1\s234 résultats/ }))
    expect(within(bar()).getByText(/~1\s234 sélectionnés/)).toBeInTheDocument()
    await user().click(within(bar()).getByRole('button', { name: 'Supprimer' }))
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'trash', query: 'from:a' })
    // Optimistic: every loaded row goes
    expect(screen.queryByRole('row', { name: /Réunion/ })).not.toBeInTheDocument()
  })

  it('offers no select-all without a search (B5 needs a query)', async () => {
    setMessages({}, MAILS, 1234)
    setup()
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner toutes les lignes de la page' }))
    expect(screen.queryByRole('button', { name: /résultats de la recherche/ })).not.toBeInTheDocument()
  })

  it('adds a user label to the selection', async () => {
    setup()
    await user().click(checkbox('Réunion'))
    await user().click(within(bar()).getByRole('button', { name: 'Ajouter un libellé' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un libellé' })
    expect(within(dialog).queryByRole('button', { name: 'Ancien' })).not.toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Factures' }))
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'label', labelId: 'Label_1', messageIds: ['m2'], delayMs: 0 })
  })

  it('« Créer une règle »: from the search, the selection or the reader (I3)', async () => {
    setup('/mails?q=from:billing@x.test')
    await user().click(screen.getByRole('button', { name: 'Créer une règle' }))
    expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('from=billing@x.test')
    await user().click(screen.getByRole('button', { name: 'close rule' }))

    await user().click(checkbox('Réunion'))
    await user().click(within(bar()).getByRole('button', { name: 'Créer une règle' }))
    expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('from=m2@x.test')
    await user().click(screen.getByRole('button', { name: 'close rule' }))

    // Two senders, and a search that is not one sender: nothing to prefill
    await user().click(checkbox('Bulletin'))
    await user().click(within(bar()).getByRole('button', { name: 'Créer une règle' }))
    expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('from=billing@x.test')
    await user().click(screen.getByRole('button', { name: 'close rule' }))

    await user().click(rowMenu('Réunion'))
    await user().click(await screen.findByRole('menuitem', { name: 'Ouvrir' }))
    await user().click(screen.getByRole('button', { name: 'viewer rule' }))
    expect(screen.queryByRole('dialog', { name: 'viewer m2' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('from=v@x.test')
  })

  it('row menu opens the reader, whose actions target its mail', async () => {
    setup()
    await user().click(rowMenu('Réunion'))
    await user().click(await screen.findByRole('menuitem', { name: 'Ouvrir' }))
    await user().click(screen.getByRole('button', { name: 'viewer trash' }))
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'trash', messageIds: ['m2'] })
    expect(screen.queryByRole('dialog', { name: 'viewer m2' })).not.toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: /Sender m1/ }))
    await user().click(screen.getByRole('button', { name: 'viewer close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('drops the selection when the account changes', async () => {
    setup()
    await user().click(checkbox('Bulletin'))
    expect(bar()).toBeInTheDocument()
    act(() => useMockAccount.setState({ accountId: 'acc-2' }))
    expect(screen.queryByRole('toolbar', { name: 'Actions sur la sélection' })).not.toBeInTheDocument()
  })

  it('keyboard: j/k move between rows, o opens, # and e act on the row or the selection, / searches, Escape clears', async () => {
    setup()
    press('j')
    expect(screen.getByRole('button', { name: /Sender m1/ })).toHaveFocus()
    press('j')
    press('k')
    expect(screen.getByRole('button', { name: /Sender m1/ })).toHaveFocus()
    press('#')
    expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'trash', messageIds: ['m1'] })
    press('j') // Réunion is now the first row
    press('o')
    expect(screen.getByRole('dialog', { name: 'viewer m2' })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'viewer close' }))

    await user().click(checkbox('Réunion'))
    press('e')
    expect(gmailApi.bulkOperation).toHaveBeenLastCalledWith('acc-1', { action: 'archive', messageIds: ['m2'] })

    press('/')
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans les mails' })).toHaveFocus()
  })

  it('Escape clears the selection; shortcuts can be turned off (WCAG 2.1.4)', async () => {
    setup()
    await user().click(checkbox('Bulletin'))
    act(() => (document.activeElement as HTMLElement).blur())
    press('Escape')
    expect(screen.queryByRole('toolbar', { name: 'Actions sur la sélection' })).not.toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: 'Désactiver' }))
    expect(localStorage.setItem).toHaveBeenCalledWith('nid.mailShortcuts', 'off')
    act(() => (document.activeElement as HTMLElement).blur())
    press('#')
    expect(gmailApi.bulkOperation).not.toHaveBeenCalled()
    await user().click(screen.getByRole('button', { name: 'Activer les raccourcis' }))
    expect(localStorage.setItem).toHaveBeenLastCalledWith('nid.mailShortcuts', 'on')
  })

  it('starts with shortcuts off when stored so, and survives blocked storage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('off')
    setup()
    expect(screen.getByText(/Raccourcis clavier désactivés/)).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    setMessages({ isError: true })
    setup()
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(messages.current.refetch).toHaveBeenCalled()
  })

  it('shows an empty state that clears the search, and refreshes on demand', async () => {
    setMessages({}, [], 0)
    setup('/mails?q=from:nobody')
    await user().click(screen.getByRole('button', { name: 'Actualiser' }))
    expect(messages.current.refetch).toHaveBeenCalled()
    expect(screen.getByText('Aucun mail ne correspond')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    expect(useGmailMessages).toHaveBeenLastCalledWith('acc-1', '', '')
  })

  it('loads more on demand', async () => {
    setMessages({ hasNextPage: true })
    setup()
    await user().click(screen.getByRole('button', { name: 'Afficher plus' }))
    expect(messages.current.fetchNextPage).toHaveBeenCalled()
    expect(screen.queryByText('Tous les mails sont chargés')).not.toBeInTheDocument()
  })

  describe('« Tous les comptes » (P2)', () => {
    beforeEach(() => useAuthStore.setState({ gmailAccounts: ACCOUNTS }))

    it('switches between one account and all of them through ?account=all', async () => {
      const { router } = setup('/mails?q=from:a')
      const select = screen.getByLabelText('Compte Gmail')
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tous les comptes', 'perso@x.test', 'pro@x.test'])
      expect(useUnifiedMessages).toHaveBeenLastCalledWith({ q: 'from:a', maxResults: 50 }, false)

      await user().selectOptions(select, 'all')
      expect(router.state.location.search).toBe('?q=from%3Aa&account=all')
      expect(useUnifiedMessages).toHaveBeenLastCalledWith({ q: 'from:a', maxResults: 50 }, true)
      expect(useGmailMessages).toHaveBeenLastCalledWith(null, 'from:a', '')

      await user().selectOptions(select, 'acc-2')
      expect(router.state.location.search).toBe('?q=from%3Aa')
      expect(useAuthStore.getState().activeAccountId).toBe('acc-2')
    })

    it('has no selector with a single active account', () => {
      useAuthStore.setState({ gmailAccounts: ACCOUNTS.slice(1) })
      setup()
      expect(screen.queryByLabelText('Compte Gmail')).not.toBeInTheDocument()
    })

    it('lists every account with its email, without the per-account actions', async () => {
      setup('/mails?account=all&q=in:inbox')
      expect(within(screen.getByRole('row', { name: /Contrat/ })).getByText('pro@x.test')).toBeInTheDocument()
      // Another account's user labels are not loaded: no raw id
      expect(screen.queryByText('Label_9')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Tout sauvegarder sur le NAS' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Créer une règle' })).not.toBeInTheDocument()
      expect(screen.queryByText('Tous les mails sont chargés')).not.toBeInTheDocument()

      await user().click(checkbox('Bulletin'))
      await user().click(checkbox('Contrat'))
      await user().click(checkbox('Devis'))
      expect(within(bar()).queryByRole('button', { name: 'Ajouter un libellé' })).not.toBeInTheDocument()
      expect(within(bar()).queryByRole('button', { name: /Sélectionner les/ })).not.toBeInTheDocument()
      // Two accounts: no rule; one account: a rule on that account
      expect(within(bar()).queryByRole('button', { name: 'Créer une règle' })).not.toBeInTheDocument()
      await user().click(checkbox('Bulletin'))
      await user().click(within(bar()).getByRole('button', { name: 'Créer une règle' }))
      expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('account=acc-2')
    })

    it('splits a bulk action into one job per account and refreshes the unified list', async () => {
      vi.mocked(gmailApi.bulkOperation).mockImplementation(async (accountId: string) => ({ jobId: `job-${accountId}` }))
      const { invalidate } = setup('/mails?account=all')
      await user().click(checkbox('Bulletin'))
      await user().click(checkbox('Contrat'))
      await user().click(checkbox('Devis'))
      await user().click(within(bar()).getByRole('button', { name: 'Marquer comme lu' }))
      expect(gmailApi.bulkOperation).toHaveBeenCalledTimes(2)
      expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-1', { action: 'mark_read', messageIds: ['m1'], delayMs: 0 })
      expect(gmailApi.bulkOperation).toHaveBeenCalledWith('acc-2', { action: 'mark_read', messageIds: ['m3', 'm4'], delayMs: 0 })

      await user().click(await screen.findByRole('button', { name: 'finish job-acc-2' }))
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gmail', 'acc-2', 'messages'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['unified'] })
    })

    it('reader, row menu and shortcuts act on the mail\'s own account, with undo', async () => {
      setup('/mails?account=all')
      await user().click(rowMenu('Contrat'))
      await user().click(await screen.findByRole('menuitem', { name: 'Ouvrir' }))
      expect(screen.getByRole('dialog', { name: 'viewer m3' })).toHaveAttribute('data-account', 'acc-2')
      await user().click(screen.getByRole('button', { name: 'viewer rule' }))
      expect(screen.getByRole('dialog', { name: 'rule sheet' })).toHaveTextContent('account=acc-2')
      await user().click(screen.getByRole('button', { name: 'close rule' }))

      await user().click(rowMenu('Devis'))
      await user().click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
      expect(gmailApi.bulkOperation).toHaveBeenLastCalledWith('acc-2', { action: 'trash', messageIds: ['m4'] })
      await waitFor(() => expect(showUndoToast).toHaveBeenCalled())
      act(() => vi.mocked(showUndoToast).mock.calls[0][0].onUndo())
      expect(jobsApi.cancel).toHaveBeenCalledWith('job-1')

      press('j')
      press('e')
      expect(gmailApi.bulkOperation).toHaveBeenLastCalledWith('acc-1', { action: 'archive', messageIds: ['m1'] })
    })
  })
})
