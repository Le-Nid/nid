import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import i18n from '../i18n'
import { MailViewer } from '../components/app/MailViewer'
import { useArchiveMail, useArchiveThread, useGmailMessage, useNotificationPreferences } from '../hooks/queries'
import { gmailApi } from '../api'

vi.mock('../hooks/queries', () => ({ useGmailMessage: vi.fn(), useArchiveMail: vi.fn(), useArchiveThread: vi.fn(), useNotificationPreferences: vi.fn(() => ({ data: undefined })) }))
vi.mock('../api', () => ({
  gmailApi: { getAttachment: vi.fn() },
  archiveApi: { downloadAttachment: (acc: string, id: string) => `/api/archive/${acc}/attachments/${id}/download` },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const b64 = (s: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_')
const HTML = '<p>Bonjour é</p><img src="https://tracker.example/p.png">'
const MAIL = {
  id: 'm1', labelIds: ['INBOX', 'Label_1', 'CATEGORY_SOCIAL'], sizeEstimate: 2048,
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Subject', value: 'Facture' }, { name: 'From', value: 'Billing <b@shop.test>' },
      { name: 'To', value: 'alice@gmail.com' }, { name: 'Date', value: 'Wed, 1 Oct 2026 10:00:00 +0000' },
    ],
    parts: [
      { mimeType: 'text/html', body: { data: b64(HTML) } },
      { mimeType: 'application/pdf', filename: 'facture.pdf', body: { attachmentId: 'att-1', size: 52000 } },
    ],
  },
}
const query = (patch: Record<string, unknown>) =>
  vi.mocked(useGmailMessage).mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...patch } as never)
const LABELS = [{ id: 'Label_1', name: 'Factures', type: 'user' as const }]

function renderViewer(props: { messageId?: string | null; onCreateRule?: (from: string) => void } = {}) {
  const handlers = { onClose: vi.fn(), onAction: vi.fn() }
  render(<MailViewer accountId="acc-1" messageId="m1" labels={LABELS} {...handlers} {...props} />)
  return handlers
}

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useArchiveMail).mockReturnValue({ data: undefined } as never)
  vi.mocked(useArchiveThread).mockReturnValue({ data: undefined } as never)
})

describe('MailViewer', () => {
  it('shows headers, labels, attachments and a sandboxed body with remote content blocked (I4)', async () => {
    query({ data: MAIL })
    renderViewer()
    const dialog = screen.getByRole('dialog', { name: 'Facture' })
    expect(useGmailMessage).toHaveBeenCalledWith('acc-1', 'm1')
    expect(within(dialog).getByText('Billing <b@shop.test>')).toBeInTheDocument()
    expect(within(dialog).getByText('Factures')).toBeInTheDocument()
    expect(within(dialog).getByText('Réseaux sociaux')).toBeInTheDocument()
    expect(within(dialog).getByRole('region', { name: '1 pièce jointe' })).toBeInTheDocument()

    const frame = within(dialog).getByTitle('Contenu du mail')
    expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
    expect(frame.getAttribute('srcdoc')).toContain("img-src data: blob:;")
    expect(frame.getAttribute('srcdoc')).toContain('<base target="_blank">')
    expect(frame.getAttribute('srcdoc')).toContain('Bonjour é')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Afficher' }))
    expect(frame.getAttribute('srcdoc')).toContain('img-src * data: blob:;')
    expect(within(dialog).queryByText(/Images distantes bloquées/)).not.toBeInTheDocument()
  })

  it('loads remote content at once when the user allows it (B10)', () => {
    vi.mocked(useNotificationPreferences).mockReturnValueOnce({ data: { remote_images: 'allow' } } as never)
    query({ data: MAIL })
    renderViewer()
    const dialog = screen.getByRole('dialog', { name: 'Facture' })
    expect(within(dialog).getByTitle('Contenu du mail').getAttribute('srcdoc')).toContain('img-src * data: blob:;')
    expect(within(dialog).queryByText(/Images distantes bloquées/)).not.toBeInTheDocument()
  })

  it('acts on the mail and closes', async () => {
    query({ data: MAIL })
    const { onAction, onClose } = renderViewer()
    const toolbar = screen.getByRole('toolbar', { name: 'Actions sur ce mail' })
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Supprimer' }))
    expect(onAction).toHaveBeenCalledWith('trash')
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le mail' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('« Créer une règle » passes the sender address, only when asked for', async () => {
    query({ data: MAIL })
    const onCreateRule = vi.fn()
    renderViewer({ onCreateRule })
    await userEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Créer une règle' }))
    expect(onCreateRule).toHaveBeenCalledWith('b@shop.test')
  })

  it('downloads an attachment, and says so when it fails', async () => {
    query({ data: MAIL })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.mocked(gmailApi.getAttachment).mockResolvedValueOnce({ data: b64('%PDF') }).mockRejectedValueOnce(new Error('404'))
    renderViewer()
    const download = screen.getByRole('button', { name: 'Télécharger facture.pdf' })
    await userEvent.click(download)
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(gmailApi.getAttachment).toHaveBeenCalledWith('acc-1', 'm1', 'att-1')
    await userEvent.click(download)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Téléchargement impossible'))
  })

  it('shows plain text bodies, the loading title and errors with retry', async () => {
    const refetch = vi.fn()
    query({ isLoading: true })
    const { rerender } = render(<MailViewer accountId="acc-1" messageId="m1" labels={[]} onClose={vi.fn()} onAction={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Chargement…' })).toBeInTheDocument()

    query({ isError: true, refetch })
    rerender(<MailViewer accountId="acc-1" messageId="m1" labels={[]} onClose={vi.fn()} onAction={vi.fn()} />)
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Réessayer' }))
    expect(refetch).toHaveBeenCalled()

    query({ data: { id: 'm1', payload: { mimeType: 'text/plain', headers: [], body: { data: b64('Texte brut') } } } })
    rerender(<MailViewer accountId="acc-1" messageId="m1" labels={[]} onClose={vi.fn()} onAction={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '(sans objet)' })).toBeInTheDocument()
    expect(screen.getByText('Texte brut')).toBeInTheDocument()
    expect(screen.queryByTitle('Contenu du mail')).not.toBeInTheDocument()
  })

  it('is closed without a message id', () => {
    query({})
    renderViewer({ messageId: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('archive source: EML body, thread, attachment links, Partager / Supprimer', async () => {
    query({})
    vi.mocked(useArchiveMail).mockReturnValue({
      data: {
        subject: 'Facture EDF', sender: 'EDF <edf@edf.test>', recipient: 'ana@gmail.com', date: '2026-08-01T07:00:00Z',
        size_bytes: '4096', label_ids: ['Label_1'], html: '<p>été</p>', text: 'texte', thread_id: 't1',
        attachments: [{ id: 'att1', filename: 'facture.pdf', size_bytes: '52000' }],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    } as never)
    vi.mocked(useArchiveThread).mockReturnValue({ data: [{ id: 'a1', sender: 'EDF <edf@edf.test>', date: '2026-08-01T07:00:00Z' }, { id: 'a2', sender: 'Ana <ana@gmail.com>', date: null }] } as never)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const onAction = vi.fn()
    const onOpenMail = vi.fn()
    render(<MailViewer source="archive" accountId="acc-1" messageId="a1" labels={LABELS} onClose={vi.fn()} onAction={onAction} onOpenMail={onOpenMail} />)

    expect(useGmailMessage).toHaveBeenCalledWith('acc-1', null)
    expect(useArchiveMail).toHaveBeenCalledWith('acc-1', 'a1')
    expect(useArchiveThread).toHaveBeenCalledWith('acc-1', 't1')
    const dialog = screen.getByRole('dialog', { name: 'Facture EDF' })
    expect(within(dialog).getByText('Factures')).toBeInTheDocument()
    expect(within(dialog).getByTitle('Contenu du mail').getAttribute('srcdoc')).toContain('<p>été</p>')

    const thread = within(dialog).getByRole('region', { name: 'Conversation (2 messages)' })
    expect(within(thread).getByRole('button', { name: /EDF/ })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(within(thread).getByRole('button', { name: /Ana/ }))
    expect(onOpenMail).toHaveBeenCalledWith('a2')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Télécharger facture.pdf' }))
    expect(click.mock.contexts[0]).toHaveProperty('href', expect.stringContaining('/api/archive/acc-1/attachments/att1/download'))

    const toolbar = within(dialog).getByRole('toolbar')
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Partager' }))
    expect(onAction).toHaveBeenCalledWith('share')
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Supprimer' }))
    expect(onAction).toHaveBeenCalledWith('trash')
  })
})
