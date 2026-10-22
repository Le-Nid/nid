import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import i18n from '../i18n'
import { attachmentsApi } from '../api'

const account = vi.hoisted(() => ({ id: 'acc-1' as string | null }))
vi.mock('../hooks/useAccount', () => ({ useAccount: () => ({ accountId: account.id }) }))
vi.mock('../api', () => ({
  attachmentsApi: {
    listLive: vi.fn(), listArchived: vi.fn(), getDedupStats: vi.fn(), runDedupBackfill: vi.fn(),
    downloadLiveUrl: (a: string, m: string, f: string, inline = false) => `/live/${a}/${m}/${f}${inline ? '?inline' : ''}`,
    downloadArchivedUrl: (a: string, id: string, inline = false) => `/archived/${a}/${id}${inline ? '?inline' : ''}`,
  },
}))

import AttachmentsPage from '../pages/Attachments'

const archived = (id: string, filename: string, mime_type: string | null, patch = {}) => ({
  id, filename, mime_type, size_bytes: 2048, mail_subject: `Sujet ${id}`, mail_sender: 'Bob <bob@test.com>', mail_date: '2026-03-30T10:00:00Z', ...patch,
})
const ARCHIVED = [archived('a1', 'document.pdf', 'application/pdf'), archived('a2', 'unknown.dat', null, { mail_subject: null, mail_date: null })]
const live = (i: number) => ({ messageId: `m${i}`, filename: `file-${i}.zip`, mimeType: 'application/zip', sizeBytes: 1000 - i, mailSubject: `Live ${i}`, mailSender: 'x@test.com', mailDate: '2026-03-29T10:00:00Z' })

function setup(url = '/attachments') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/attachments', element: <AttachmentsPage /> }], { initialEntries: [url] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}
const params = (router: ReturnType<typeof setup>) => Object.fromEntries(new URLSearchParams(router.state.location.search))

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  account.id = 'acc-1'
  vi.mocked(attachmentsApi.listArchived).mockResolvedValue({ attachments: ARCHIVED, total: 2, totalSizeBytes: 4096 })
  vi.mocked(attachmentsApi.listLive).mockResolvedValue({ attachments: [live(1)], totalSizeBytes: 999 })
  vi.mocked(attachmentsApi.getDedupStats).mockResolvedValue({ savedBytes: 1024, duplicateFiles: 3, hashCoverage: 0.5 })
  vi.mocked(attachmentsApi.runDedupBackfill).mockResolvedValue({})
})

describe('AttachmentsPage', () => {
  it('lists archived attachments with preview only for images and PDFs, and download for all', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Pièces jointes' })).toBeInTheDocument()
    const pdf = (await screen.findByText('document.pdf')).closest('tr')!
    expect(within(pdf).getByRole('link', { name: 'Voir document.pdf' })).toHaveAttribute('href', '/archived/acc-1/a1?inline')
    expect(within(pdf).getByRole('link', { name: 'Télécharger document.pdf' })).toHaveAttribute('href', '/archived/acc-1/a1')
    const dat = screen.getByText('unknown.dat').closest('tr')!
    expect(within(dat).queryByRole('link', { name: /Voir/ })).toBeNull()
    expect(within(dat).getByText('(sans sujet)')).toBeInTheDocument()
    expect(attachmentsApi.listArchived).toHaveBeenCalledWith('acc-1', { page: 1, limit: 50, sort: 'size', order: 'desc' })
  })

  it('shows totals and dedup stats, and runs the dedup backfill when hashes are missing', async () => {
    setup()
    const stats = await screen.findByText('Espace économisé')
    const tile = stats.closest('div')!
    await waitFor(() => expect(tile).toHaveTextContent('3 fichier(s) dupliqué(s), 1 Ko économisés'))
    expect(screen.getByText('Archives locales')).toBeInTheDocument()
    await userEvent.click(within(tile).getByRole('button', { name: 'Analyser' }))
    expect(attachmentsApi.runDedupBackfill).toHaveBeenCalled()
  })

  it('searches the archives through the URL and back to page 1', async () => {
    const router = setup('/attachments?page=2')
    await screen.findByText('document.pdf')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher dans les pièces jointes archivées' }), 'facture{Enter}')
    await waitFor(() => expect(params(router)).toEqual({ q: 'facture' }))
    expect(attachmentsApi.listArchived).toHaveBeenLastCalledWith('acc-1', { page: 1, limit: 50, sort: 'size', order: 'desc', q: 'facture' })
  })

  it('pages the archives on the server', async () => {
    vi.mocked(attachmentsApi.listArchived).mockResolvedValue({ attachments: ARCHIVED, total: 120, totalSizeBytes: 4096 })
    const router = setup()
    await screen.findByText('document.pdf')
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    await waitFor(() => expect(params(router)).toEqual({ page: '2' }))
    expect(attachmentsApi.listArchived).toHaveBeenLastCalledWith('acc-1', expect.objectContaining({ page: 2 }))
  })

  it('switches to Gmail, without search, and pages the 200 results locally', async () => {
    vi.mocked(attachmentsApi.listLive).mockResolvedValue({ attachments: Array.from({ length: 60 }, (_, i) => live(i)), totalSizeBytes: 999 })
    const router = setup('/attachments?q=old')
    await userEvent.click(await screen.findByRole('button', { name: 'Live' }))
    expect(params(router)).toEqual({ source: 'live' })
    expect(await screen.findByText('file-0.zip')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByText('Gmail (>100 Ko)')).toBeInTheDocument()
    expect(screen.queryByText('file-50.zip')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    expect(await screen.findByText('file-50.zip')).toBeInTheDocument()
    expect(attachmentsApi.listLive).toHaveBeenCalledTimes(1)
  })

  it('reloads, and shows an error with retry', async () => {
    vi.mocked(attachmentsApi.listArchived).mockRejectedValueOnce(new Error('down'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur lors du chargement des pièces jointes')
    await userEvent.click(screen.getByRole('button', { name: 'Recharger' }))
    expect(await screen.findByText('document.pdf')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    vi.mocked(attachmentsApi.listArchived).mockResolvedValue({ attachments: [], total: 0, totalSizeBytes: 0 })
    setup()
    expect(await screen.findByText('Aucune pièce jointe trouvée')).toBeInTheDocument()
  })

  it('asks for a Gmail account when none is active', () => {
    account.id = null
    setup()
    expect(screen.getByText('Aucun compte Gmail connecté')).toBeInTheDocument()
    expect(attachmentsApi.listArchived).not.toHaveBeenCalled()
  })
})
