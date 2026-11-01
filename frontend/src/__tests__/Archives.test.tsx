import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import {
  archiveApi, archiveThreadsApi, dashboardApi, importApi, labelsApi, retentionApi, sharingApi,
} from '../api'
import { showUndoToast } from '../components/app/UndoToast'
import { useAuthStore } from '../store/auth.store'
import type { JobState } from '../hooks/useJobSSE'

const account = vi.hoisted(() => ({ id: 'acc-1' as string | null, provider: 'gmail', shared_by: undefined as string | undefined }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: account.id, account: { provider: account.provider, shared_by: account.shared_by } }) }))
vi.mock('../api', () => ({
  archiveApi: {
    listMails: vi.fn(), getMail: vi.fn(), trashMails: vi.fn(), restoreMails: vi.fn(), listTrash: vi.fn(), emptyTrash: vi.fn(),
    getTrashConfig: vi.fn(), updateTrashConfig: vi.fn(), triggerArchive: vi.fn(), listTags: vi.fn(), tagMails: vi.fn(), deleteTag: vi.fn(), listContacts: vi.fn(), restoreToMailbox: vi.fn(),
    downloadAttachment: (acc: string, id: string) => `/api/archive/${acc}/attachments/${id}/download`,
  },
  archiveThreadsApi: { getThread: vi.fn() },
  labelsApi: { list: vi.fn() },
  dashboardApi: { getArchiveStats: vi.fn() },
  retentionApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), run: vi.fn() },
  sharingApi: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
  importApi: { exportMbox: vi.fn() },
  gmailApi: { getAttachment: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('../components/app/JobProgressInline', () => ({
  JobProgressInline: ({ label, onDone }: { label: string; onDone: (j: Partial<JobState>) => void }) => (
    <button type="button" onClick={() => onDone({ status: 'completed' })}>{label}</button>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ArchivesPage from '../pages/Archives'

const MAIL = {
  id: '11111111-1111-1111-1111-111111111111', subject: 'Facture EDF', sender: 'EDF <edf@edf.test>', date: '2026-08-01T07:00:00Z',
  size_bytes: '8192', has_attachments: true, snippet: 'Votre facture', highlight: 'Votre <mark>facture</mark> &lt;script&gt;x&lt;/script&gt;',
}
const OTHER = { ...MAIL, id: '22222222-2222-2222-2222-222222222222', subject: 'Relevé', has_attachments: false, highlight: undefined, snippet: 'Relevé mensuel' }
const LABELS = [
  { id: 'INBOX', name: 'INBOX', type: 'system', archived_count: 3 },
  { id: 'L1', name: 'Factures', type: 'user', archived_count: 2 },
  { id: 'L2', name: 'Factures/EDF', type: 'user', archived_count: 1 },
  { id: 'L3', name: 'Vide', type: 'user', archived_count: 0 },
]
const SHARE = {
  id: 's1', archived_mail_id: MAIL.id, token: 'tok', expires_at: '2099-01-01T00:00:00Z', access_count: 1, max_access: null,
  subject: 'Facture EDF', sender: 'EDF <edf@edf.test>',
}
const POLICY = { id: 'p1', name: 'Vieilles factures', account_id: 'acc-1', label: 'L1', max_age_days: 365, last_run_at: null, deleted_count: 0 }

let mobile = false
function setup(url = '/archives') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/archives', element: <ArchivesPage /> }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router }
}
const user = () => userEvent.setup()

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  account.id = 'acc-1'
  account.provider = 'gmail'
  account.shared_by = undefined
  mobile = false
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes('max-width') ? mobile : false,
    media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } as never })
  vi.mocked(archiveApi.listMails).mockResolvedValue({ mails: [MAIL, OTHER], total: 2, page: 1, limit: 50, tookMs: 120 })
  vi.mocked(archiveApi.getMail).mockResolvedValue({ ...MAIL, recipient: 'a@b.c', label_ids: [], html: '', text: 'corps', thread_id: null, attachments: [] })
  vi.mocked(archiveApi.trashMails).mockResolvedValue({ trashed: 1 })
  vi.mocked(archiveApi.restoreMails).mockResolvedValue({ restored: 1 })
  vi.mocked(archiveApi.listTags).mockResolvedValue([])
  vi.mocked(archiveApi.restoreToMailbox).mockResolvedValue({ jobId: 'job-restore' })
  vi.mocked(archiveApi.listContacts).mockResolvedValue({
    contacts: [
      { email: 'bob@x.fr', name: 'Martin, Bob', from_count: 1204, to_count: 3, last_at: '2026-08-01T07:00:00Z' },
      { email: 'carl@z.fr', name: null, from_count: 0, to_count: 1, last_at: null },
    ],
    total: 51, page: 1, limit: 50,
  })
  vi.mocked(archiveApi.tagMails).mockResolvedValue({ updated: 1 })
  vi.mocked(archiveApi.deleteTag).mockResolvedValue({ updated: 2 })
  vi.mocked(archiveApi.listTrash).mockResolvedValue({ mails: [{ ...OTHER, deleted_at: '2026-10-01T00:00:00Z' }], total: 1, retentionDays: 30 })
  vi.mocked(archiveApi.emptyTrash).mockResolvedValue({ deleted: 1 })
  vi.mocked(archiveApi.getTrashConfig).mockResolvedValue({ retentionDays: 30, purgeEnabled: true })
  vi.mocked(archiveApi.updateTrashConfig).mockResolvedValue({})
  vi.mocked(archiveApi.triggerArchive).mockResolvedValue({ jobId: 'job-nas' })
  vi.mocked(archiveThreadsApi.getThread).mockResolvedValue([])
  vi.mocked(labelsApi.list).mockResolvedValue(LABELS)
  vi.mocked(dashboardApi.getArchiveStats).mockResolvedValue({ total_mails: '1204', total_size: String(5 * 1024 ** 3), last_archived_at: new Date(Date.now() - 2 * 3600_000).toISOString() })
  vi.mocked(retentionApi.list).mockResolvedValue([POLICY, { ...POLICY, id: 'p2', account_id: 'other' }])
  vi.mocked(retentionApi.create).mockResolvedValue({})
  vi.mocked(retentionApi.update).mockResolvedValue({})
  vi.mocked(retentionApi.remove).mockResolvedValue({})
  vi.mocked(retentionApi.run).mockResolvedValue({ policiesRun: 1, totalDeleted: 4 })
  vi.mocked(sharingApi.list).mockResolvedValue([SHARE, { ...SHARE, id: 's2', expires_at: '2000-01-01T00:00:00Z' }])
  vi.mocked(sharingApi.create).mockResolvedValue({ ...SHARE, id: 's3', token: 'newtok' })
  vi.mocked(sharingApi.revoke).mockResolvedValue({})
  vi.mocked(importApi.exportMbox).mockResolvedValue(new Blob(['mbox']))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})

describe('Archives — search', () => {
  it('shows the backup status, the label tree and highlighted results with their count', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Archives' })).toBeInTheDocument()
    expect(await screen.findByText(/Dernière sauvegarde il y a 2 heures · 1\s204 mails · 5 Go/)).toBeInTheDocument()
    expect(await screen.findByText(/2 résultats · 0,12 s/)).toBeInTheDocument()

    const tree = screen.getByRole('tree', { name: 'Libellés' })
    const items = within(tree).getAllByRole('treeitem')
    expect(items.map((i) => i.textContent)).toEqual(['Tous les mails1 204', 'Boîte de réception3', 'Factures2', 'EDF1'])
    expect(items[3]).toHaveAttribute('aria-level', '2')
    expect(items[0]).toHaveAttribute('aria-selected', 'true')

    const mark = await screen.findByText('facture', { selector: 'mark' })
    // The escaped <script> is text, never an element
    expect(mark.parentElement).toHaveTextContent('Votre facture <script>x</script>')
    expect(document.querySelector('main script, td script')).toBeNull()
    expect(screen.getByText('Relevé mensuel')).toBeInTheDocument()
  })

  it('filters by label with the tree (click and keyboard), and by sender, dates and attachments', async () => {
    const { router } = setup()
    const tree = await screen.findByRole('tree')
    await user().click(await within(tree).findByRole('treeitem', { name: /Factures/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?label=L1'))
    await waitFor(() => expect(archiveApi.listMails).toHaveBeenCalledWith('acc-1', { label: 'L1', page: 1, limit: 50 }))

    within(tree).getByRole('treeitem', { name: /Factures/ }).focus()
    await user().keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(router.state.location.search).toBe('?label=L2'))
    await user().keyboard('{Home} ')
    await waitFor(() => expect(router.state.location.search).toBe(''))

    await user().type(screen.getByLabelText('Expéditeur'), 'edf')
    await user().type(screen.getByLabelText('Du'), '2026-01-01')
    await user().type(screen.getByLabelText('Au'), '2026-02-01')
    await user().click(screen.getByRole('checkbox', { name: 'Avec pièce jointe' }))
    await waitFor(() => expect(archiveApi.listMails).toHaveBeenLastCalledWith('acc-1', {
      sender: 'edf', from_date: '2026-01-01', to_date: '2026-02-01T23:59:59.999Z', has_attachments: 'true', page: 1, limit: 50,
    }))
  })

  it('debounces the search into ?q=, and offers to clear filters when nothing matches', async () => {
    const { router } = setup()
    await user().type(screen.getByRole('searchbox', { name: 'Rechercher dans les archives' }), 'facture')
    await waitFor(() => expect(router.state.location.search).toBe('?q=facture'))
    expect(archiveApi.listMails).not.toHaveBeenCalledWith('acc-1', expect.objectContaining({ q: 'f' }))

    vi.mocked(archiveApi.listMails).mockResolvedValue({ mails: [], total: 0, page: 1, limit: 50 })
    await act(() => router.navigate('/archives?q=zzz'))
    await user().click(await screen.findByRole('button', { name: 'Effacer la recherche et les filtres' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByText('Aucun mail archivé')).toBeInTheDocument()
  })

  it('loads more pages', async () => {
    vi.mocked(archiveApi.listMails).mockResolvedValueOnce({ mails: [MAIL], total: 51, page: 1, limit: 50 })
    setup()
    await user().click(await screen.findByRole('button', { name: 'Afficher plus' }))
    await waitFor(() => expect(archiveApi.listMails).toHaveBeenCalledWith('acc-1', { page: 2, limit: 50 }))
    expect(await screen.findByText('Relevé')).toBeInTheDocument()
  })

  it('load error offers a retry', async () => {
    vi.mocked(archiveApi.listMails).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les archives.')
  })

  it('selection: export .mbox, delete at once to the archive trash, « Annuler » restores', async () => {
    setup()
    await user().click(await screen.findByRole('checkbox', { name: 'Sélectionner Facture EDF' }))
    const bar = screen.getByRole('toolbar', { name: 'Actions sur la sélection' })
    await user().click(within(bar).getByRole('button', { name: 'Exporter .mbox' }))
    await waitFor(() => expect(importApi.exportMbox).toHaveBeenCalledWith('acc-1', [MAIL.id]))

    await user().click(within(bar).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(archiveApi.trashMails).toHaveBeenCalledWith('acc-1', [MAIL.id]))
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Suppression de 1 archive' })))
    act(() => vi.mocked(showUndoToast).mock.calls[0][0].onUndo())
    await waitFor(() => expect(archiveApi.restoreMails).toHaveBeenCalledWith('acc-1', [MAIL.id]))
  })

  it('header: export the whole archive, back up to the NAS now with inline progress', async () => {
    setup()
    await user().click(screen.getByRole('button', { name: 'Exporter (.mbox)' }))
    await waitFor(() => expect(importApi.exportMbox).toHaveBeenCalledWith('acc-1', undefined))
    await user().click(screen.getByRole('button', { name: 'Sauvegarder sur le NAS maintenant' }))
    await waitFor(() => expect(archiveApi.triggerArchive).toHaveBeenCalledWith('acc-1', { differential: true }))
    await user().click(await screen.findByRole('button', { name: 'Sauvegarde sur le NAS' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sauvegarde sur le NAS' })).toBeNull())
  })

  it('export and backup failures are reported', async () => {
    vi.mocked(importApi.exportMbox).mockRejectedValue(new Error('x'))
    vi.mocked(archiveApi.triggerArchive).mockRejectedValue(new Error('x'))
    setup()
    await user().click(screen.getByRole('button', { name: 'Exporter (.mbox)' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L'export .mbox a échoué."))
    await user().click(screen.getByRole('button', { name: 'Sauvegarder sur le NAS maintenant' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La sauvegarde n'a pas pu être lancée."))
  })
})

describe('Archives — reader and sharing', () => {
  it('opens the reader, shares a link, copies it, revokes the active one', async () => {
    setup()
    await user().click(await screen.findByRole('button', { name: 'pièce jointe Facture EDF' }))
    const reader = await screen.findByRole('dialog', { name: 'Facture EDF' })
    expect(await within(reader).findByText('corps')).toBeInTheDocument()
    await user().click(within(reader).getByRole('button', { name: 'Partager' }))

    const dialog = await screen.findByRole('dialog', { name: 'Partager ce mail' })
    await user().selectOptions(within(dialog).getByLabelText('Durée de validité'), '168')
    await user().click(within(dialog).getByRole('button', { name: 'Créer le lien' }))
    await waitFor(() => expect(sharingApi.create).toHaveBeenCalledWith({ archivedMailId: MAIL.id, expiresInHours: 168 }))
    expect(await within(dialog).findByLabelText('Lien de partage')).toHaveValue(`${window.location.origin}/shared/newtok`)
    await user().click(within(dialog).getByRole('button', { name: 'Copier le lien Facture EDF' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Lien copié'))

    // Expired links are not listed
    expect(within(dialog).getByRole('heading', { name: '1 lien actif' })).toBeInTheDocument()
    await user().click(within(dialog).getByRole('button', { name: 'Révoquer le lien 1 de « Facture EDF »' }))
    await waitFor(() => expect(sharingApi.revoke).toHaveBeenCalledWith('s1'))
    expect(toast.success).toHaveBeenCalledWith('Lien révoqué')
  })

  it('« Supprimer » in the reader closes it and offers undo', async () => {
    setup()
    await user().click(await screen.findByRole('button', { name: 'pièce jointe Facture EDF' }))
    const reader = await screen.findByRole('dialog', { name: 'Facture EDF' })
    await user().click(within(within(reader).getByRole('toolbar')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(showUndoToast).toHaveBeenCalled()
  })

  it('row menu opens the share dialog', async () => {
    vi.mocked(sharingApi.create).mockRejectedValue(new Error('x'))
    setup()
    await user().click(await screen.findByRole('button', { name: 'Actions pour Relevé' }))
    await user().click(screen.getByRole('menuitem', { name: 'Partager' }))
    const dialog = await screen.findByRole('dialog', { name: 'Partager ce mail' })
    await user().click(within(dialog).getByRole('button', { name: 'Créer le lien' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de créer le lien.'))
  })
})

describe('Archives — mobile', () => {
  it('tags: tree filter, add and remove on the selection, delete a tag everywhere', async () => {
    vi.mocked(archiveApi.listTags).mockResolvedValue([{ tag: 'impôts', count: 2 }])
    const { router } = setup()
    const tags = await screen.findByRole('tree', { name: 'Tags' })
    await user().click(await within(tags).findByRole('treeitem', { name: /impôts/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?tag=imp%C3%B4ts'))
    await waitFor(() => expect(archiveApi.listMails).toHaveBeenCalledWith('acc-1', { tag: 'impôts', page: 1, limit: 50 }))

    await user().click(await screen.findByRole('checkbox', { name: 'Sélectionner Facture EDF' }))
    await user().click(within(screen.getByRole('toolbar', { name: 'Actions sur la sélection' })).getByRole('button', { name: 'Tags' }))
    let dialog = await screen.findByRole('dialog', { name: 'Tags' })
    expect(within(dialog).getByRole('button', { name: 'Ajouter' })).toBeDisabled()
    await user().type(within(dialog).getByLabelText('Tags, séparés par des virgules'), 'énergie, 2026')
    await user().click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(archiveApi.tagMails).toHaveBeenCalledWith('acc-1', { mailIds: [MAIL.id], add: ['énergie', '2026'] }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tags ajoutés à 1 archive'))
    expect(screen.queryByRole('toolbar', { name: 'Actions sur la sélection' })).toBeNull()

    vi.mocked(archiveApi.tagMails).mockRejectedValueOnce(new Error('x'))
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner Facture EDF' }))
    await user().click(within(screen.getByRole('toolbar', { name: 'Actions sur la sélection' })).getByRole('button', { name: 'Tags' }))
    dialog = await screen.findByRole('dialog', { name: 'Tags' })
    await user().type(within(dialog).getByLabelText('Tags, séparés par des virgules'), 'impôts')
    await user().click(within(dialog).getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(archiveApi.tagMails).toHaveBeenLastCalledWith('acc-1', { mailIds: [MAIL.id], remove: ['impôts'] }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Les tags n'ont pas pu être modifiés."))
    await user().keyboard('{Escape}')

    await user().click(screen.getByRole('button', { name: 'Supprimer le tag « impôts »' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer le tag' }))
    await waitFor(() => expect(archiveApi.deleteTag).toHaveBeenCalledWith('acc-1', 'impôts'))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(toast.success).toHaveBeenCalledWith('Tag « impôts » supprimé')
  })

  it('« Restaurer dans la boîte mail »: the selection, then from the reader; a failure is reported', async () => {
    setup()
    await user().click(await screen.findByRole('checkbox', { name: 'Sélectionner Facture EDF' }))
    await user().click(within(screen.getByRole('toolbar', { name: 'Actions sur la sélection' })).getByRole('button', { name: 'Restaurer dans la boîte mail' }))
    await waitFor(() => expect(archiveApi.restoreToMailbox).toHaveBeenCalledWith('acc-1', [MAIL.id]))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Restauration de 1 mail dans la boîte mail lancée', { description: 'Une notification vous préviendra à la fin.' }))

    vi.mocked(archiveApi.restoreToMailbox).mockRejectedValueOnce(new Error('409'))
    await user().click(screen.getByText('Relevé'))
    const reader = await screen.findByRole('dialog')
    await user().click(within(within(reader).getByRole('toolbar')).getByRole('button', { name: 'Restaurer dans la boîte mail' }))
    await waitFor(() => expect(archiveApi.restoreToMailbox).toHaveBeenLastCalledWith('acc-1', [OTHER.id]))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La restauration dans la boîte mail n'a pas pu être lancée."))
  })

  it('an account shared read-only: search and read only (no header actions, selection, row or reader actions, owner tabs)', async () => {
    account.shared_by = 'ana@example.com'
    vi.mocked(archiveApi.getMail).mockResolvedValue({ ...MAIL, recipient: 'a@b.c', label_ids: [], tags: ['impôts'], html: '', text: 'corps', thread_id: null, attachments: [] })
    setup('/archives?tab=trash')
    expect(await screen.findByText('Facture EDF')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sauvegarder sur le NAS maintenant' })).toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Mails', 'Contacts'])
    expect(screen.queryByRole('checkbox', { name: 'Sélectionner Facture EDF' })).toBeNull()
    await user().click(screen.getByText('Facture EDF'))
    const reader = await screen.findByRole('dialog')
    expect(within(within(reader).getByRole('toolbar')).queryAllByRole('button')).toHaveLength(0)
    const tags = await within(reader).findByRole('region', { name: 'Tags' })
    expect(within(tags).getByText('impôts')).toBeInTheDocument()
    expect(within(tags).queryByRole('button')).toBeNull()
    expect(within(tags).queryByRole('combobox')).toBeNull()
  })

  it('an IMAP account restores too, to its server', async () => {
    account.provider = 'imap'
    setup()
    await user().click(await screen.findByRole('checkbox', { name: 'Sélectionner Facture EDF' }))
    await user().click(within(screen.getByRole('toolbar', { name: 'Actions sur la sélection' })).getByRole('button', { name: 'Restaurer dans la boîte mail' }))
    await waitFor(() => expect(archiveApi.restoreToMailbox).toHaveBeenCalledWith('acc-1', [MAIL.id]))
  })

  it('a failed tag deletion is reported', async () => {
    vi.mocked(archiveApi.listTags).mockResolvedValue([{ tag: 'impôts', count: 2 }])
    vi.mocked(archiveApi.deleteTag).mockRejectedValueOnce(new Error('x'))
    setup('/archives?tag=imp%C3%B4ts')
    await user().click(await screen.findByRole('button', { name: 'Supprimer le tag « impôts »' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer le tag' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Les tags n'ont pas pu être modifiés."))
  })

  it('cards with the extract; filters and label in a sheet', async () => {
    mobile = true
    vi.mocked(archiveApi.listTags).mockResolvedValue([{ tag: 'impôts', count: 2 }])
    const { router } = setup()
    expect(await screen.findByText('Relevé mensuel')).toBeInTheDocument()
    expect(screen.queryByRole('tree')).toBeNull()
    await user().click(screen.getByRole('button', { name: 'Filtres' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtres' })
    await user().selectOptions(within(sheet).getByLabelText('Libellé'), 'L2')
    await waitFor(() => expect(router.state.location.search).toBe('?label=L2'))
    await user().selectOptions(within(sheet).getByLabelText('Tag'), 'impôts')
    await waitFor(() => expect(router.state.location.search).toBe('?label=L2&tag=imp%C3%B4ts'))
    await user().click(within(sheet).getByRole('button', { name: 'Afficher les résultats' }))
    expect(await screen.findByRole('button', { name: 'Filtres (2)' })).toBeInTheDocument()
  })
})

describe('Archives — tabs', () => {
  it('Corbeille: restore, empty after confirmation (D2), admin edits the purge settings', async () => {
    setup('/archives?tab=trash')
    expect(await screen.findByText('1 mail dans la corbeille')).toBeInTheDocument()
    await user().click(await screen.findByRole('button', { name: 'Restaurer Relevé' }))
    await waitFor(() => expect(archiveApi.restoreMails).toHaveBeenCalledWith('acc-1', [OTHER.id]))
    expect(toast.success).toHaveBeenCalledWith('1 mail restauré')

    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner Relevé' }))
    await user().click(within(screen.getByRole('toolbar', { name: 'Actions sur la sélection' })).getByRole('button', { name: 'Restaurer' }))
    await waitFor(() => expect(archiveApi.restoreMails).toHaveBeenCalledTimes(2))

    await user().click(screen.getByRole('button', { name: 'Vider la corbeille' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Supprimer définitivement 1 archive ?' })
    await user().click(within(confirm).getByRole('button', { name: 'Supprimer définitivement 1 archive' }))
    await waitFor(() => expect(archiveApi.emptyTrash).toHaveBeenCalledWith('acc-1'))

    const form = screen.getByRole('form', { name: "Purge de la corbeille (toute l'instance)" })
    await user().clear(within(form).getByLabelText('Durée avant purge (jours)'))
    await user().type(within(form).getByLabelText('Durée avant purge (jours)'), '60')
    await user().click(within(form).getByRole('checkbox', { name: 'Purge automatique' }))
    await user().click(within(form).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(archiveApi.updateTrashConfig).toHaveBeenCalledWith({ retentionDays: 60, purgeEnabled: false }))
  })

  it('Corbeille: non-admins only read the purge settings; failures are reported', async () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', role: 'user' } as never })
    vi.mocked(archiveApi.restoreMails).mockRejectedValue(new Error('x'))
    vi.mocked(archiveApi.emptyTrash).mockRejectedValue(new Error('x'))
    setup('/archives?tab=trash')
    expect(await screen.findByText('Les mails de la corbeille sont supprimés définitivement après 30 jours.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
    await user().click(await screen.findByRole('button', { name: 'Restaurer Relevé' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('La restauration a échoué.'))
    await user().click(screen.getByRole('button', { name: 'Vider la corbeille' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer définitivement 1 archive' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de vider la corbeille.'))
  })

  it('Rétention: lists this account\'s policies, creates, edits, runs and deletes', async () => {
    setup('/archives?tab=retention')
    expect(await screen.findByRole('button', { name: 'Vieilles factures' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Vieilles factures' })).toHaveLength(1) // the other account's is hidden
    expect(screen.getByText('Plus de 365 jours')).toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: 'Nouvelle politique' }))
    let sheet = await screen.findByRole('dialog', { name: 'Nouvelle politique de rétention' })
    await user().type(within(sheet).getByLabelText('Nom'), 'Promos')
    await user().selectOptions(within(sheet).getByLabelText('Libellé'), 'L2')
    await user().clear(within(sheet).getByLabelText('Supprimer après (jours)'))
    await user().type(within(sheet).getByLabelText('Supprimer après (jours)'), '30')
    await user().click(within(sheet).getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(retentionApi.create).toHaveBeenCalledWith({ name: 'Promos', gmailAccountId: 'acc-1', label: 'L2', maxAgeDays: 30 }))

    await user().click(await screen.findByRole('button', { name: 'Vieilles factures' }))
    sheet = await screen.findByRole('dialog', { name: 'Modifier la politique' })
    await user().selectOptions(within(sheet).getByLabelText('Libellé'), '')
    await user().click(within(sheet).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(retentionApi.update).toHaveBeenCalledWith('p1', { name: 'Vieilles factures', label: '', maxAgeDays: 365 }))

    await user().click(screen.getByRole('button', { name: 'Exécuter maintenant' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 politique(s) exécutée(s) · 4 archives supprimées'))

    await user().click(screen.getByRole('button', { name: 'Actions pour la politique Vieilles factures' }))
    await user().click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer la politique' }))
    await waitFor(() => expect(retentionApi.remove).toHaveBeenCalledWith('p1'))
  })

  it('Partages: active links only, revoke', async () => {
    setup('/archives?tab=shares')
    expect(await screen.findByText('1 / ∞')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Révoquer le lien/ })).toHaveLength(1)
    await user().click(screen.getByRole('button', { name: 'Révoquer le lien Facture EDF' }))
    await waitFor(() => expect(sharingApi.revoke).toHaveBeenCalledWith('s1'))
  })

  it('Contacts: count, search in ?q=, more pages, a contact opens its mails', async () => {
    const { router } = setup('/archives?tab=contacts')
    expect(await screen.findByText('51 contacts')).toBeInTheDocument()
    expect(screen.getByText('Martin, Bob')).toBeInTheDocument()
    expect(screen.getAllByText('Martin, Bob')[0].closest('tr, li')).toHaveTextContent(/1\s204/)
    expect(screen.getAllByText('carl@z.fr')).toHaveLength(2) // no name: the address is the title
    await user().click(screen.getByRole('button', { name: 'Afficher plus' }))
    await waitFor(() => expect(archiveApi.listContacts).toHaveBeenCalledWith('acc-1', { page: 2, limit: 50 }))

    await user().type(screen.getByRole('searchbox', { name: 'Rechercher un contact' }), 'bob')
    await waitFor(() => expect(router.state.location.search).toBe('?tab=contacts&q=bob'))
    await waitFor(() => expect(archiveApi.listContacts).toHaveBeenCalledWith('acc-1', { q: 'bob', page: 1, limit: 50 }))
    await user().clear(screen.getByRole('searchbox', { name: 'Rechercher un contact' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tab=contacts'))

    await user().click(screen.getAllByText('Martin, Bob')[0])
    await waitFor(() => expect(router.state.location.search).toBe('?sender=bob%40x.fr'))
  })

  it('Contacts: empty, no match, load error', async () => {
    vi.mocked(archiveApi.listContacts).mockResolvedValue({ contacts: [], total: 0, page: 1, limit: 50 })
    const { router } = setup('/archives?tab=contacts')
    expect(await screen.findByText('Aucun contact')).toBeInTheDocument()
    await act(() => router.navigate('/archives?tab=contacts&q=zz'))
    expect(await screen.findByText('Aucun contact ne correspond')).toBeInTheDocument()
    vi.mocked(archiveApi.listContacts).mockRejectedValue(new Error('x'))
    await act(() => router.navigate('/archives?tab=contacts&q=yy'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les contacts.')
  })

  it('switching tabs drops the other tab\'s params; no account shows an empty state', async () => {
    const { router } = setup('/archives?q=x')
    await user().click(screen.getByRole('tab', { name: 'Partages' }))
    await waitFor(() => expect(router.state.location.search).toBe('?tab=shares'))
    await user().click(screen.getByRole('tab', { name: 'Mails' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('without an account', () => {
    account.id = null
    setup()
    expect(screen.getByText('Connectez un compte Gmail pour consulter ses archives.')).toBeInTheDocument()
  })
})
