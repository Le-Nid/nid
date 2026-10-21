import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import i18n from '../i18n'
import { labelsApi, rulesApi } from '../api'
import { showUndoToast } from '../components/app/UndoToast'
import { describeCondition, RuleSheet, type RuleSheetTarget } from '../components/app/RuleSheet'
import type { Rule, RuleCondition } from '../types/rules'

vi.mock('../api', () => ({
  rulesApi: { preview: vi.fn(), create: vi.fn(), update: vi.fn(), run: vi.fn() },
  labelsApi: { list: vi.fn() },
  jobsApi: { cancel: vi.fn() },
}))
vi.mock('../components/app/UndoToast', () => ({ showUndoToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PREVIEW = {
  query: 'from:(news@x.test) older_than:30d',
  estimatedCount: 143,
  sizeBytes: 58 * 1024 * 1024,
  samples: [1, 2, 3, 4].map((i) => ({ id: `m${i}`, from: `News <news@x.test>`, subject: i === 2 ? '' : `Lettre ${i}`, date: '' })),
}

function setup(target: RuleSheetTarget | null) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/', element: <RuleSheet accountId="acc-1" target={target} onClose={onClose} /> },
      { path: '/mails', element: <p>mails page</p> },
    ],
  )
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { onClose, router }
}
const user = () => userEvent.setup()

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rulesApi.preview).mockResolvedValue(PREVIEW)
  vi.mocked(rulesApi.create).mockResolvedValue({ id: 'r-new', name: 'Mails de news@x.test' })
  vi.mocked(rulesApi.run).mockResolvedValue({ jobId: 'job-r', runAt: '' })
  vi.mocked(labelsApi.list).mockResolvedValue([{ id: 'L1', name: 'Factures', type: 'user' }])
})

describe('describeCondition', () => {
  const t = i18n.t.bind(i18n)
  const c = (field: string, operator: string, value: string | boolean) => describeCondition({ field, operator, value } as RuleCondition, t)
  it('reads every field in plain language', () => {
    expect(c('from', 'contains', 'a@b.c')).toBe('de a@b.c')
    expect(c('from', 'not_equals', 'a@b.c')).toBe('pas de a@b.c')
    expect(c('to', 'contains', 'moi')).toBe('envoyé à moi')
    expect(c('subject', 'not_contains', 'promo')).toBe('objet sans « promo »')
    expect(c('has_attachment', 'is_true', true)).toBe('avec pièce jointe')
    expect(c('has_attachment', 'is_true', false)).toBe('sans pièce jointe')
    expect(c('size_gt', 'gt', '10m')).toBe('plus gros que 10m')
    expect(c('size_lt', 'lt', '1m')).toBe('plus petit que 1m')
    expect(c('older_than', 'gt', '6m')).toBe('de plus de 6 mois')
    expect(c('newer_than', 'gt', '1d')).toBe('de moins de 1 jour')
    expect(c('older_than', 'gt', '2w')).toBe('de plus de 2w')
    expect(c('label', 'equals', 'UNREAD')).toBe('avec le libellé Non lus')
    expect(c('label', 'not_equals', 'Perso')).toBe('sans le libellé Perso')
  })
})

describe('RuleSheet', () => {
  it('prefilled from a sender: preview with 3 samples and a link to the mails', async () => {
    const { onClose, router } = setup({ from: 'news@x.test' })
    const sheet = screen.getByRole('dialog', { name: 'Nouvelle règle' })
    expect(within(sheet).getByLabelText('Nom')).toHaveValue('Mails de news@x.test')
    expect(within(sheet).getByRole('radio', { name: 'Aucune limite' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'Supprimer' })).toBeChecked()
    expect(await within(sheet).findByText('143 mails concernés · 58 Mo')).toBeInTheDocument()
    const samples = within(sheet).getByRole('list', { name: 'Exemples' })
    expect(within(samples).getAllByRole('listitem')).toHaveLength(3)
    expect(samples).toHaveTextContent(i18n.t('mails.noSubject'))
    await user().click(within(sheet).getByRole('link', { name: 'Voir les 143 mails' }))
    expect(router.state.location.pathname).toBe('/mails')
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(PREVIEW.query)
    expect(onClose).toHaveBeenCalled()
  })

  it('debounces the preview and creates the rule, then runs it on existing mails with undo', async () => {
    const { onClose } = setup({ from: 'news@x.test' })
    const sheet = screen.getByRole('dialog')
    await within(sheet).findByText('143 mails concernés · 58 Mo')
    await user().click(within(sheet).getByRole('radio', { name: '30 jours' }))
    await waitFor(() => expect(rulesApi.preview).toHaveBeenLastCalledWith('acc-1', [
      { field: 'from', operator: 'contains', value: 'news@x.test' }, { field: 'older_than', operator: 'gt', value: '30d' },
    ]))
    await user().click(within(sheet).getByRole('radio', { name: 'Hebdomadaire' }))
    await user().click(within(sheet).getByRole('checkbox', { name: 'Appliquer aussi aux mails déjà reçus' }))
    await user().click(within(sheet).getByRole('button', { name: 'Créer la règle' }))
    await waitFor(() => expect(rulesApi.create).toHaveBeenCalledWith('acc-1', {
      name: 'Mails de news@x.test',
      conditions: [{ field: 'from', operator: 'contains', value: 'news@x.test' }, { field: 'older_than', operator: 'gt', value: '30d' }],
      action: { type: 'trash' }, schedule: 'weekly', is_active: true,
    }))
    await waitFor(() => expect(rulesApi.run).toHaveBeenCalledWith('acc-1', 'r-new'))
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Exécution de « Mails de news@x.test »' })))
    expect(toast.success).toHaveBeenCalledWith('Règle créée')
    expect(onClose).toHaveBeenCalled()
  })

  it('« Appliquer un libellé » needs a label', async () => {
    setup({})
    const sheet = screen.getByRole('dialog')
    await user().type(within(sheet).getByLabelText('Nom'), 'Factures')
    await user().type(within(sheet).getByLabelText('Quand un mail arrive de'), 'edf.fr')
    await user().click(within(sheet).getByRole('radio', { name: 'Appliquer un libellé' }))
    const create = within(sheet).getByRole('button', { name: 'Créer la règle' })
    expect(create).toBeDisabled()
    await within(sheet).findByRole('option', { name: 'Factures' })
    await user().selectOptions(within(sheet).getByLabelText('Libellé'), 'L1')
    await user().click(within(sheet).getByRole('radio', { name: 'Manuelle' }))
    await user().click(create)
    await waitFor(() => expect(rulesApi.create).toHaveBeenCalledWith('acc-1', expect.objectContaining({
      action: { type: 'label', labelId: 'L1' }, schedule: null,
    })))
    expect(rulesApi.run).not.toHaveBeenCalled()
  })

  it('an age alone cannot be saved: it would target the whole mailbox', async () => {
    setup({})
    const sheet = screen.getByRole('dialog')
    await user().type(within(sheet).getByLabelText('Nom'), 'Tout')
    await user().click(within(sheet).getByRole('radio', { name: '7 jours' }))
    expect(within(sheet).getByRole('button', { name: 'Créer la règle' })).toBeDisabled()
    expect(within(sheet).getByText(/une règle basée sur la seule durée viserait toute la boîte/)).toBeInTheDocument()
    expect(rulesApi.preview).not.toHaveBeenCalled()
  })

  it('edit keeps conditions and an action it does not offer', async () => {
    const rule = {
      id: 'r1', name: 'Lus', is_active: false, schedule: 'monthly', action: { type: 'mark_read' },
      conditions: [{ field: 'has_attachment', operator: 'is_true', value: true }, { field: 'older_than', operator: 'gt', value: '2y' }],
    } as unknown as Rule
    vi.mocked(rulesApi.update).mockResolvedValue(rule)
    setup({ rule })
    const sheet = screen.getByRole('dialog', { name: 'Modifier la règle' })
    expect(within(sheet).getByText('avec pièce jointe, de plus de 2 ans')).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Marquer comme lu' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'Mensuelle' })).toBeChecked()
    await user().click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(rulesApi.update).toHaveBeenCalledWith('acc-1', 'r1', {
      name: 'Lus', conditions: rule.conditions, action: { type: 'mark_read' }, schedule: 'monthly',
    }))
  })

  it('preview error and save error are reported', async () => {
    vi.mocked(rulesApi.preview).mockRejectedValue(new Error('x'))
    vi.mocked(rulesApi.create).mockRejectedValue(new Error('x'))
    setup({ from: 'a@b.c' })
    const sheet = screen.getByRole('dialog')
    expect(await within(sheet).findByText('Aperçu indisponible')).toBeInTheDocument()
    await user().click(within(sheet).getByRole('button', { name: 'Créer la règle' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'enregistrer la règle."))
  })

  it('closed when there is no target', () => {
    setup(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
