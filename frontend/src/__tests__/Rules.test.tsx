import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import { gmailApi, jobsApi, labelsApi, rulesApi } from '../api'
import { showUndoToast } from '../components/app/UndoToast'

const account = vi.hoisted(() => ({ id: 'acc-1' as string | null }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: account.id }) }))
vi.mock('../api', () => ({
  rulesApi: {
    list: vi.fn(), getTemplates: vi.fn(), toggle: vi.fn(), delete: vi.fn(), run: vi.fn(), preview: vi.fn(),
    create: vi.fn(), update: vi.fn(), createFromTemplate: vi.fn(),
  },
  labelsApi: { list: vi.fn() },
  gmailApi: { createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() },
  jobsApi: { cancel: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import RulesPage from '../pages/Rules'

const RULE = {
  id: 'r1', name: 'Promos', is_active: true, schedule: 'daily', last_run_at: null, template_id: null,
  conditions: [{ field: 'from', operator: 'contains', value: 'promo@shop.test' }, { field: 'older_than', operator: 'gt', value: '30d' }],
  action: { type: 'trash' },
}
const INVOICES = {
  id: 'r2', name: 'Factures', is_active: false, schedule: null, last_run_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  template_id: 'label-invoices', conditions: [{ field: 'subject', operator: 'contains', value: 'facture' }], action: { type: 'label', labelId: 'L1' },
}
const LABELS = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'L1', name: 'Factures', type: 'user', color_bg: '#16a766', archived_count: 4 },
  { id: 'L2', name: 'Factures/EDF', type: 'user', archived_count: 1 },
  { id: 'L3', name: 'Ancien', type: 'user', deleted_at: '2026-01-01' },
]
const TEMPLATES = [
  { id: 'label-invoices', name: 'Factures', description: 'Range les factures', category: 'label', label: { name: 'Factures' } },
  { id: 'label-bank', name: 'Banque', description: 'Range la banque', category: 'label', label: { name: 'Banque' } },
  { id: 'expire-otp', name: 'Codes OTP', description: 'Expire après 1 jour', category: 'expire' },
  { id: 'cleanup-github', name: 'Notifs GitHub', description: 'Nettoie', category: 'cleanup' },
]

let mobile = false
function setup(url = '/rules') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const router = createMemoryRouter(
    [{ path: '/rules', element: <RulesPage /> }, { path: '/mails', element: <p>mails page</p> }],
    { initialEntries: [url] },
  )
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, invalidate }
}
const user = () => userEvent.setup()
const rowOf = async (name: string) => (await screen.findByRole('button', { name })).closest('tr')!
const openMenu = async (label: string) => user().click(await screen.findByRole('button', { name: label }))

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
  vi.mocked(rulesApi.list).mockResolvedValue([RULE, INVOICES])
  vi.mocked(rulesApi.getTemplates).mockResolvedValue(TEMPLATES)
  vi.mocked(rulesApi.preview).mockResolvedValue({ query: 'from:(promo@shop.test)', estimatedCount: 3, sizeBytes: 1024, samples: [] })
  vi.mocked(rulesApi.run).mockResolvedValue({ jobId: 'job-r', runAt: '' })
  vi.mocked(rulesApi.toggle).mockResolvedValue({})
  vi.mocked(rulesApi.delete).mockResolvedValue({})
  vi.mocked(rulesApi.update).mockResolvedValue(RULE)
  vi.mocked(rulesApi.createFromTemplate).mockResolvedValue({ id: 'r9' })
  vi.mocked(labelsApi.list).mockResolvedValue(LABELS)
  vi.mocked(gmailApi.createLabel).mockResolvedValue({ id: 'L9' })
  vi.mocked(gmailApi.updateLabel).mockResolvedValue({ id: 'L1' })
  vi.mocked(gmailApi.deleteLabel).mockResolvedValue({})
  vi.mocked(jobsApi.cancel).mockResolvedValue({})
})

describe('Rules page', () => {
  it('lists rules in plain language, with the labels count on the tab', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Règles & libellés' })).toBeInTheDocument()
    const row = await rowOf('Promos')
    expect(row).toHaveTextContent('de promo@shop.test, de plus de 30 jours')
    expect(row).toHaveTextContent('Supprimer')
    expect(row).toHaveTextContent('Jamais exécutée')
    expect(within(row).getByRole('switch', { name: 'Règle « Promos » active' })).toBeChecked()
    const invoices = await rowOf('Factures')
    expect(invoices).toHaveTextContent('objet contenant « facture »')
    expect(invoices).toHaveTextContent('Appliquer un libellé « Factures »')
    expect(invoices).toHaveTextContent('il y a 2 heures')
    expect(within(invoices).getByRole('switch')).not.toBeChecked()
    // Deleted and system labels are not counted
    expect(screen.getByRole('tab', { name: 'Libellés 2' })).toBeInTheDocument()
  })

  it('toggles a rule, and reports a failure', async () => {
    const { invalidate } = setup()
    await user().click(within(await rowOf('Promos')).getByRole('switch'))
    await waitFor(() => expect(rulesApi.toggle).toHaveBeenCalledWith('acc-1', 'r1'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules', 'acc-1'] }))
    vi.mocked(rulesApi.toggle).mockRejectedValue(new Error('x'))
    await user().click(within(await rowOf('Promos')).getByRole('switch'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible de changer l'état de la règle."))
  })

  it('« Exécuter » runs after the 10 s delay with an undo toast (D1)', async () => {
    setup()
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Exécuter' }))
    await waitFor(() => expect(rulesApi.run).toHaveBeenCalledWith('acc-1', 'r1'))
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Exécution de « Promos »' })))
    vi.mocked(showUndoToast).mock.calls[0][0].onUndo()
    expect(jobsApi.cancel).toHaveBeenCalledWith('job-r')
  })

  it('run and undo failures are reported', async () => {
    vi.mocked(jobsApi.cancel).mockRejectedValue(new Error('late'))
    setup()
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Exécuter' }))
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled())
    vi.mocked(showUndoToast).mock.calls[0][0].onUndo()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(i18n.t('mails.undoFailed')))
    vi.mocked(rulesApi.run).mockRejectedValue(new Error('x'))
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Exécuter' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'exécuter la règle."))
  })

  it('« Supprimer » asks for confirmation', async () => {
    setup()
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer la règle « Promos » ?' })
    await user().click(within(dialog).getByRole('button', { name: 'Supprimer la règle' }))
    await waitFor(() => expect(rulesApi.delete).toHaveBeenCalledWith('acc-1', 'r1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Règle supprimée'))
  })

  it('delete failure is reported', async () => {
    vi.mocked(rulesApi.delete).mockRejectedValue(new Error('x'))
    setup()
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer la règle' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Impossible de supprimer la règle.'))
  })

  it('« Modifier » (menu or row) opens the sheet on the rule and saves it', async () => {
    setup()
    await openMenu('Actions pour la règle Promos')
    await user().click(screen.getByRole('menuitem', { name: 'Modifier' }))
    const sheet = await screen.findByRole('dialog', { name: 'Modifier la règle' })
    expect(within(sheet).getByLabelText('Quand un mail arrive de')).toHaveValue('promo@shop.test')
    expect(within(sheet).getByRole('radio', { name: '30 jours' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'Quotidienne' })).toBeChecked()
    await user().click(within(sheet).getByRole('radio', { name: 'Archiver (retirer de la boîte)' }))
    await user().click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(rulesApi.update).toHaveBeenCalledWith('acc-1', 'r1', {
      name: 'Promos', conditions: RULE.conditions, action: { type: 'archive' }, schedule: 'daily',
    }))
    expect(toast.success).toHaveBeenCalledWith('Règle enregistrée')

    await user().click(await screen.findByRole('button', { name: 'Factures' }))
    expect(await screen.findByRole('dialog', { name: 'Modifier la règle' })).toHaveTextContent('objet contenant « facture »')
  })

  it('empty: « Nouvelle règle » opens a blank sheet', async () => {
    vi.mocked(rulesApi.list).mockResolvedValue([])
    setup()
    const empty = (await screen.findByText('Aucune règle')).closest('[data-slot="empty"]') as HTMLElement
    await user().click(within(empty).getByRole('button', { name: 'Nouvelle règle' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle règle' })
    expect(within(sheet).getByText('Indiquez un expéditeur : une règle basée sur la seule durée viserait toute la boîte.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Créer la règle' })).toBeDisabled()
  })

  it('?new=1 opens a new rule and is dropped on close', async () => {
    const { router } = setup('/rules?new=1')
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle règle' })
    await user().click(within(sheet).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('load error offers a retry; no account shows an empty state', async () => {
    vi.mocked(rulesApi.list).mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les règles.')
    vi.mocked(rulesApi.list).mockResolvedValue([RULE])
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('button', { name: 'Promos' })).toBeInTheDocument()
  })

  it('without account: empty state, no tabs', () => {
    account.id = null
    setup()
    expect(screen.getByText('Aucun compte Gmail connecté')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('mobile: cards, no table', async () => {
    mobile = true
    setup()
    expect(await screen.findByRole('button', { name: 'Promos' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('Labels tab', () => {
  const labelMenu = (name: string) => openMenu(`Actions pour le libellé ${name}`)

  it('switches tab through the URL; tree nested by « / », categories, templates', async () => {
    const { router } = setup()
    await user().click(screen.getByRole('tab', { name: /Libellés/ }))
    expect(router.state.location.search).toBe('?tab=labels')
    const tree = (await screen.findByText('EDF')).closest('ul')!.parentElement!.closest('li')!
    expect(tree).toHaveTextContent('Factures4 mails archivés')
    expect(screen.queryByText('Ancien')).toBeNull()
    expect(screen.getByText('Réseaux sociaux')).toBeInTheDocument()
    expect(screen.getByText('Attribuées par Gmail, non modifiables.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Autres modèles' })).toBeInTheDocument()
    await user().click(screen.getByRole('tab', { name: 'Règles' }))
    expect(router.state.location.search).toBe('')
  })

  it('creates a label', async () => {
    const { invalidate } = setup('/rules?tab=labels')
    await user().click(await screen.findByRole('button', { name: 'Nouveau libellé' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouveau libellé' })
    await user().type(within(dialog).getByLabelText('Nom'), 'Voyages/Trains')
    await user().click(within(dialog).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(gmailApi.createLabel).toHaveBeenCalledWith('acc-1', 'Voyages/Trains'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['labels'] }))
    expect(toast.success).toHaveBeenCalledWith('Libellé créé')
  })

  it('renames, recolors and deletes a label', async () => {
    setup('/rules?tab=labels')
    await labelMenu('Factures/EDF')
    await user().click(screen.getByRole('menuitem', { name: 'Renommer' }))
    const rename = screen.getByRole('dialog', { name: 'Renommer « Factures/EDF »' })
    const input = within(rename).getByLabelText('Nom')
    expect(input).toHaveValue('Factures/EDF')
    await user().clear(input)
    await user().type(input, 'Factures/Énergie')
    await user().click(within(rename).getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(gmailApi.updateLabel).toHaveBeenCalledWith('acc-1', 'L2', { name: 'Factures/Énergie' }))

    await labelMenu('Factures')
    await user().click(screen.getByRole('menuitem', { name: 'Couleur' }))
    const colors = screen.getByRole('dialog', { name: 'Couleur de « Factures »' })
    expect(within(colors).getByRole('button', { name: 'Vert' })).toHaveAttribute('aria-pressed', 'true')
    await user().click(within(colors).getByRole('button', { name: 'Bleu' }))
    await waitFor(() => expect(gmailApi.updateLabel).toHaveBeenCalledWith('acc-1', 'L1', { color: { backgroundColor: '#4a86e8', textColor: '#ffffff' } }))

    await labelMenu('Factures')
    await user().click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer le libellé' }))
    await waitFor(() => expect(gmailApi.deleteLabel).toHaveBeenCalledWith('acc-1', 'L1'))
  })

  it('label errors are reported', async () => {
    vi.mocked(gmailApi.deleteLabel).mockRejectedValue(new Error('x'))
    setup('/rules?tab=labels')
    await labelMenu('Factures')
    await user().click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    await user().click(await screen.findByRole('button', { name: 'Supprimer le libellé' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Gmail a refusé la modification du libellé.'))
  })

  it('« Créer une règle » prefills the label action; « Voir les mails » searches it', async () => {
    const { router } = setup('/rules?tab=labels')
    await labelMenu('Factures/EDF')
    await user().click(screen.getByRole('menuitem', { name: 'Créer une règle' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle règle' })
    expect(within(sheet).getByRole('radio', { name: 'Appliquer un libellé' })).toBeChecked()
    expect(within(sheet).getByLabelText('Libellé')).toHaveValue('L2')
    expect(within(sheet).getByLabelText('Nom')).toHaveValue('Factures/EDF')
    await user().click(within(sheet).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await labelMenu('Factures/EDF')
    await user().click(screen.getByRole('menuitem', { name: 'Voir les mails' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mails'))
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('label:Factures/EDF')
  })

  it('templates: active one edits its rule, others create label + rule', async () => {
    const { invalidate } = setup('/rules?tab=labels')
    const invoices = (await screen.findByRole('heading', { name: 'Factures' })).closest('li')!
    expect(invoices).toHaveTextContent('Déjà actif')
    await user().click(within(invoices).getByRole('button', { name: 'Modifier la règle' }))
    expect(await screen.findByRole('dialog', { name: 'Modifier la règle' })).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Annuler' }))

    const bank = screen.getByRole('heading', { name: 'Banque' }).closest('li')!
    await user().click(within(bank).getByRole('button', { name: 'Créer le libellé et la règle' }))
    await waitFor(() => expect(rulesApi.createFromTemplate).toHaveBeenCalledWith('acc-1', 'label-bank'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['labels'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules', 'acc-1'] })
    expect(toast.success).toHaveBeenCalledWith('« Banque » est actif')

    vi.mocked(rulesApi.createFromTemplate).mockRejectedValue(new Error('x'))
    const otp = screen.getByRole('heading', { name: 'Codes OTP' }).closest('li')!
    await user().click(within(otp).getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'activer le modèle."))
  })

  it('no labels: empty state; load error: retry', async () => {
    vi.mocked(labelsApi.list).mockResolvedValue([])
    setup('/rules?tab=labels')
    expect(await screen.findByText('Aucun libellé')).toBeInTheDocument()
  })

  it('labels load error offers a retry', async () => {
    vi.mocked(labelsApi.list).mockRejectedValue(new Error('x'))
    setup('/rules?tab=labels')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les libellés.')
    vi.mocked(labelsApi.list).mockResolvedValue(LABELS)
    await user().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('EDF')).toBeInTheDocument()
  })
})
