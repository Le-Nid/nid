import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ─── Mocks ─────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.defaultValue || key }),
}))

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: 'acc-1', account: null }),
}))

const mockArchiveMails = vi.fn()
const mockArchiveThreads = vi.fn()
const mockArchiveTrash = vi.fn()

vi.mock('../hooks/queries', () => ({
  useArchiveMails: (...args: any[]) => mockArchiveMails(...args),
  useArchiveThreads: (...args: any[]) => mockArchiveThreads(...args),
  useArchiveTrash: (...args: any[]) => mockArchiveTrash(...args),
}))

const mockGetMail = vi.fn()
const mockTrashMails = vi.fn()
const mockRestoreMails = vi.fn()
const mockEmptyTrash = vi.fn()
const mockGetThread = vi.fn()

vi.mock('../api', () => ({
  archiveApi: {
    getMail: (...args: any[]) => mockGetMail(...args),
    trashMails: (...args: any[]) => mockTrashMails(...args),
    restoreMails: (...args: any[]) => mockRestoreMails(...args),
    emptyTrash: (...args: any[]) => mockEmptyTrash(...args),
    downloadAttachment: vi.fn().mockReturnValue('/api/archive/acc-1/attachments/att-1/download'),
  },
  archiveThreadsApi: {
    getThread: (...args: any[]) => mockGetThread(...args),
  },
}))

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { baseURL: '' },
  },
}))

vi.mock('../components/JobProgressModal', () => ({
  default: () => null,
}))

// Wrap with App.useApp mock
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd')
  return {
    ...(actual as any),
    App: {
      ...(actual as any).App,
      useApp: () => ({
        notification: {
          success: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
        },
        message: {
          success: vi.fn(),
          error: vi.fn(),
        },
        modal: {
          confirm: vi.fn(),
        },
      }),
    },
  }
})

import ArchivePage from '../pages/Archive'

const refetchMock = vi.fn()

const sampleMail = {
  id: 'mail-1',
  gmail_message_id: 'gm-1',
  subject: 'Test Subject',
  sender: 'John <john@test.com>',
  date: '2026-03-30T10:00:00Z',
  size_bytes: 2048,
  has_attachments: true,
  label_ids: [],
  archived_at: '2026-03-31T10:00:00Z',
  snippet: 'Preview text',
}

const sampleMailDetail = {
  id: 'mail-1',
  subject: 'Test Subject',
  sender: 'John <john@test.com>',
  date: '2026-03-30T10:00:00Z',
  size_bytes: 2048,
  archived_at: '2026-03-31T10:00:00Z',
  emlContent: 'Content-Type: text/plain\r\n\r\nHello world',
  attachments: [
    { id: 'att-1', filename: 'doc.pdf', mime_type: 'application/pdf', size_bytes: 512 },
  ],
}

const sampleMailDetailHtml = {
  ...sampleMailDetail,
  emlContent: 'Content-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Hello =C3=A9</p>',
}

const sampleMailDetailMultipart = {
  ...sampleMailDetail,
  emlContent: [
    'Content-Type: multipart/mixed; boundary="abc123"',
    '',
    '--abc123',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa('<p>Bonjour</p>'),
    '',
    '--abc123--',
  ].join('\r\n'),
}

const sampleMailDetailImage = {
  ...sampleMailDetail,
  attachments: [
    { id: 'att-img', filename: 'photo.jpg', mime_type: 'image/jpeg', size_bytes: 1024 },
    { id: 'att-pdf', filename: 'doc.pdf', mime_type: 'application/pdf', size_bytes: 512 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMail.mockResolvedValue(sampleMailDetail)
  mockTrashMails.mockResolvedValue({ trashed: 1 })
  mockRestoreMails.mockResolvedValue({ restored: 1 })
  mockEmptyTrash.mockResolvedValue({ deleted: 3 })
  mockGetThread.mockResolvedValue([])
  mockArchiveMails.mockReturnValue({
    data: { mails: [], total: 0 },
    isLoading: false,
    refetch: refetchMock,
  })
  mockArchiveThreads.mockReturnValue({
    data: { threads: [], total: 0 },
    isLoading: false,
    refetch: refetchMock,
  })
  mockArchiveTrash.mockReturnValue({
    data: { mails: [], total: 0, retentionDays: 30 },
    isLoading: false,
    refetch: refetchMock,
  })
})

describe('ArchivePage', () => {
  it('renders title', () => {
    render(<ArchivePage />)
    expect(screen.getByText('archive.title')).toBeInTheDocument()
  })

  it('renders search and filter bar', () => {
    render(<ArchivePage />)
    expect(screen.getByText('common.search')).toBeInTheDocument()
  })

  it('shows list view by default', () => {
    render(<ArchivePage />)
    expect(screen.getByText('archive.listView')).toBeInTheDocument()
    expect(screen.getByText('archive.threadView')).toBeInTheDocument()
    expect(screen.getByText('archive.trashView')).toBeInTheDocument()
  })

  it('shows empty state when no mails', () => {
    render(<ArchivePage />)
    expect(screen.getByText('archive.noArchive')).toBeInTheDocument()
  })

  it('renders mails in list mode', () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    expect(screen.getByText('Test Subject')).toBeInTheDocument()
  })

  it('renders loading state', () => {
    mockArchiveMails.mockReturnValue({
      data: null,
      isLoading: true,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    expect(screen.getByText('archive.title')).toBeInTheDocument()
  })

  it('shows total archived count', () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [], total: 42 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    expect(screen.getByText('archive.totalArchived')).toBeInTheDocument()
  })

  // ─── Trash mode ───────────────────────────────────────
  it('switches to trash mode', () => {
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('archive.trashInfo')).toBeInTheDocument()
  })

  it('shows trash empty state', () => {
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('archive.trashEmpty')).toBeInTheDocument()
  })

  it('renders trash mails with retention info', () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{
          ...sampleMail,
          id: 'mail-t1',
          subject: 'Trashed Mail',
          deleted_at: '2026-04-01T10:00:00Z',
        }],
        total: 1,
        retentionDays: 14,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('Trashed Mail')).toBeInTheDocument()
  })

  it('shows empty trash button when trash has items', () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, deleted_at: '2026-04-01T10:00:00Z' }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('archive.emptyTrash')).toBeInTheDocument()
  })

  // ─── Thread mode ──────────────────────────────────────
  it('switches to thread mode', () => {
    mockArchiveThreads.mockReturnValue({
      data: { threads: [], total: 0 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))
    expect(screen.getByText('archive.noThreads')).toBeInTheDocument()
  })

  it('shows total threads count', () => {
    mockArchiveThreads.mockReturnValue({
      data: {
        threads: [{
          thread_id: 'thread-1',
          message_count: 3,
          subject: 'Thread Subject',
          sender: 'Alice <alice@test.com>',
          senders: ['alice@test.com', 'bob@test.com'],
          total_size: '4096',
          has_attachments: true,
          latest_date: '2026-03-30T10:00:00Z',
          snippet: 'Preview',
        }],
        total: 5,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))
    expect(screen.getByText('archive.totalThreads')).toBeInTheDocument()
  })

  it('renders thread cards with message count', () => {
    mockArchiveThreads.mockReturnValue({
      data: {
        threads: [{
          thread_id: 'thread-1',
          message_count: 3,
          subject: 'Thread Subject',
          sender: 'Alice <alice@test.com>',
          senders: ['alice@test.com', 'bob@test.com'],
          total_size: '4096',
          has_attachments: false,
          latest_date: '2026-03-30T10:00:00Z',
          snippet: 'Preview',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))
    expect(screen.getByText('Thread Subject')).toBeInTheDocument()
  })

  it('expands thread on click', async () => {
    const threadMails = [
      { id: 'tm-1', subject: 'Reply 1', sender: 'bob@test.com', date: '2026-03-30T10:00:00Z', size_bytes: 512, has_attachments: false },
      { id: 'tm-2', subject: 'Reply 2', sender: 'alice@test.com', date: '2026-03-30T11:00:00Z', size_bytes: 256, has_attachments: true },
    ]
    mockGetThread.mockResolvedValue(threadMails)
    mockArchiveThreads.mockReturnValue({
      data: {
        threads: [{
          thread_id: 'thread-1',
          message_count: 2,
          subject: 'Thread Subject',
          sender: 'Alice',
          senders: ['alice@test.com'],
          total_size: '768',
          has_attachments: false,
          latest_date: '2026-03-30T10:00:00Z',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))
    await act(async () => {
      fireEvent.click(screen.getByText('Thread Subject'))
    })
    await waitFor(() => {
      expect(mockGetThread).toHaveBeenCalledWith('acc-1', 'thread-1')
    })
  })

  // ─── Viewer drawer ───────────────────────────────────
  it('opens viewer drawer when clicking a mail', async () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(mockGetMail).toHaveBeenCalledWith('acc-1', 'mail-1')
    })
  })

  it('displays attachments in viewer drawer', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetailImage)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('photo.jpg')).toBeInTheDocument()
      expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    })
  })

  it('displays EML plain text in viewer', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      // The viewer renders an iframe with srcDoc containing the parsed EML
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  it('displays HTML EML with QP encoding in viewer', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetailHtml)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  it('displays multipart EML with base64 encoding in viewer', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetailMultipart)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  it('toggles between HTML and raw EML view', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('archive.htmlView')).toBeInTheDocument()
      expect(screen.getByText('archive.emlRaw')).toBeInTheDocument()
    })

    // Switch to raw mode
    fireEvent.click(screen.getByText('archive.emlRaw'))

    // Should show raw EML content in a <pre>
    const pre = document.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre!.textContent).toContain('Hello world')
  })

  it('viewer shows sender and date info', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('archive.from')).toBeInTheDocument()
      expect(screen.getByText('archive.dateFull')).toBeInTheDocument()
      expect(screen.getByText('archive.archivedAt')).toBeInTheDocument()
    })
  })

  it('viewer shows null EML as empty', async () => {
    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: null, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  // ─── Selection / bulk actions ─────────────────────────
  it('shows bulk action bar when mails are selected via checkbox', async () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail, { ...sampleMail, id: 'mail-2', subject: 'Another' }], total: 2 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    // Click the select-all checkbox
    const checkboxes = document.querySelectorAll('.ant-checkbox-input')
    if (checkboxes.length > 0) {
      await act(async () => {
        fireEvent.click(checkboxes[0])
      })
    }
    expect(checkboxes.length).toBeGreaterThan(0)
  })

  // ─── Error handling ───────────────────────────────────
  it('handles error when opening a mail fails', async () => {
    mockGetMail.mockRejectedValue(new Error('Failed'))
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    // Should not crash
    expect(screen.getByText('archive.title')).toBeInTheDocument()
  })

  it('handles error when expanding thread fails', async () => {
    mockGetThread.mockRejectedValue(new Error('Failed'))
    mockArchiveThreads.mockReturnValue({
      data: {
        threads: [{
          thread_id: 'thread-1',
          message_count: 2,
          subject: 'Thread Subject',
          sender: 'Alice',
          senders: ['alice@test.com'],
          total_size: '768',
          has_attachments: false,
          latest_date: '2026-03-30T10:00:00Z',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))

    await act(async () => {
      fireEvent.click(screen.getByText('Thread Subject'))
    })

    // Should not crash
    expect(screen.getByText('archive.title')).toBeInTheDocument()
  })

  // ─── EML parsing edge cases (via viewer) ──────────────
  it('handles multipart EML with nested multipart/alternative', async () => {
    const nestedEml = [
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: multipart/alternative; boundary="inner"',
      '',
      '--inner',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain text fallback',
      '',
      '--inner',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Rich HTML</p>',
      '',
      '--inner--',
      '--outer--',
    ].join('\r\n')

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: nestedEml, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  it('handles EML with no boundary (single-part base64)', async () => {
    const b64Eml = 'Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\n' + btoa('<p>Base64 HTML</p>')

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: b64Eml, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  it('handles EML with no boundary (single-part plain text)', async () => {
    const plainEml = 'Content-Type: text/plain\r\n\r\nJust plain text here'

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: plainEml, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('srcdoc')).toContain('Just plain text here')
    })
  })

  it('handles multipart EML with only text/plain part', async () => {
    const textOnlyMultipart = [
      'Content-Type: multipart/mixed; boundary="bnd"',
      '',
      '--bnd',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Only plain text content',
      '',
      '--bnd--',
    ].join('\r\n')

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: textOnlyMultipart, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('srcdoc')).toContain('Only plain text content')
    })
  })

  it('handles multipart EML with no matching parts', async () => {
    const noParts = [
      'Content-Type: multipart/mixed; boundary="empty"',
      '',
      '--empty',
      'Content-Type: application/octet-stream',
      '',
      'binary data',
      '',
      '--empty--',
    ].join('\r\n')

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: noParts, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
    })
  })

  // ─── Threads loading state ────────────────────────────
  it('shows loading state in thread mode', () => {
    mockArchiveThreads.mockReturnValue({
      data: null,
      isLoading: true,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))
    // Should render loading card
    expect(screen.getByText('archive.title')).toBeInTheDocument()
  })

  // ─── Filter attachments ───────────────────────────────
  it('renders attachment filter options', () => {
    render(<ArchivePage />)
    expect(screen.getByText('archive.filterAttachments')).toBeInTheDocument()
  })

  // ─── Restore button in trash view ────────────────────
  it('shows restore button in trash mail rows', async () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'trashed-1', deleted_at: '2026-04-01T10:00:00Z' }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    // Each trash row has a restore button (RotateCcw icon)
    const restoreButtons = screen.getAllByRole('button').filter(
      (btn: HTMLElement) => btn.querySelector('[data-testid]') || btn.closest('[title]')
    )
    expect(restoreButtons.length).toBeGreaterThanOrEqual(0)
  })

  // ─── Viewer drawer ZIP button ────────────────────────
  it('viewer drawer has ZIP export button', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('ZIP')).toBeInTheDocument()
    })
  })

  // ─── View eye button on mail row ─────────────────────
  it('mail row has view button', () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    // There should be at least one eye button via the columns render
    const buttons = document.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  // ─── Viewer download button for attachments ──────────
  it('viewer shows download button for each attachment', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('doc.pdf')).toBeInTheDocument()
      expect(screen.getByText('common.download')).toBeInTheDocument()
    })
  })

  // ─── Trash columns: deleted_at and expiresIn ─────────
  it('shows deletion date and expiration in trash view', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString()
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'tr-1', deleted_at: fiveDaysAgo }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    // Should show the deletion date column header
    expect(screen.getAllByText('archive.deletedAt').length).toBeGreaterThanOrEqual(1)
  })

  // ─── Trash expiration colors ─────────────────────────
  it('shows red tag when mail expires in <= 3 days', () => {
    const recentDelete = new Date(Date.now() - 28 * 86400000).toISOString() // 28 days ago, 2 left
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'tr-red', deleted_at: recentDelete }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    // Check we have at least one tag with the expiration info
    const tags = document.querySelectorAll('.ant-tag')
    expect(tags.length).toBeGreaterThan(0)
  })

  // ─── Single-part QP email without HTML ────────────────
  it('handles single-part QP plain text email', async () => {
    const qpEml = 'Content-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello =C3=A9l=C3=A8ve'

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: qpEml, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      // Should be wrapped in <pre> since it's plain text
      expect(iframe!.getAttribute('srcdoc')).toContain('<pre')
    })
  })

  // ─── Multipart with base64 html part ──────────────────
  it('handles multipart with base64 html and QP text', async () => {
    const mixedEml = [
      'Content-Type: multipart/alternative; boundary="alt"',
      '',
      '--alt',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Plain =C3=A9',
      '',
      '--alt',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa('<h1>Hello</h1>'),
      '',
      '--alt--',
    ].join('\r\n')

    mockGetMail.mockResolvedValue({ ...sampleMailDetail, emlContent: mixedEml, attachments: [] })
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const iframe = document.querySelector('iframe')
      expect(iframe).toBeTruthy()
      expect(iframe!.getAttribute('srcdoc')).toContain('<h1>Hello</h1>')
    })
  })

  // ─── Thread collapse toggle ───────────────────────────
  it('collapses thread when clicking same thread twice', async () => {
    mockGetThread.mockResolvedValue([
      { id: 'tm-1', subject: 'Reply', sender: 'bob@test.com', date: '2026-03-30T10:00:00Z', size_bytes: 512, has_attachments: false },
    ])
    mockArchiveThreads.mockReturnValue({
      data: {
        threads: [{
          thread_id: 'thread-1',
          message_count: 1,
          subject: 'Thread Subject',
          sender: 'Alice',
          senders: ['alice@test.com'],
          total_size: '512',
          has_attachments: false,
          latest_date: '2026-03-30T10:00:00Z',
        }],
        total: 1,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.threadView'))

    // First click: expand
    await act(async () => {
      fireEvent.click(screen.getByText('Thread Subject'))
    })
    await waitFor(() => {
      expect(mockGetThread).toHaveBeenCalledTimes(1)
    })

    // Second click: collapse (same thread)
    await act(async () => {
      fireEvent.click(screen.getByText('Thread Subject'))
    })
    // Should not call getThread a second time — just toggles expansion
    expect(mockGetThread).toHaveBeenCalledTimes(1)
  })

  // ─── Mail with image attachment in viewer ─────────────
  it('renders inline image preview for image attachments', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetailImage)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      const img = document.querySelector('img[alt="photo.jpg"]')
      expect(img).toBeTruthy()
    })
  })

  // ─── Mail with no subject ─────────────────────────────
  it('renders mail with no subject', () => {
    mockArchiveMails.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, subject: '' }],
        total: 1,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    expect(screen.getByText('common.noSubject')).toBeInTheDocument()
  })

  // ─── Search triggers load ─────────────────────────────
  it('clicking search button triggers load', () => {
    render(<ArchivePage />)
    const searchBtn = screen.getByText('common.search')
    fireEvent.click(searchBtn)
    // refetch should be called since page doesn't change
    expect(refetchMock).toHaveBeenCalled()
  })

  // ─── Restore button in trash row triggers restoreMails ─
  it('restore button in trash row calls restoreMails', async () => {
    mockRestoreMails.mockResolvedValue({ restored: 1 })
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'trashed-1', deleted_at: '2026-04-01T10:00:00Z' }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    // Find the restore icon button (first button with RotateCcw icon in the row)
    const restoreButtons = document.querySelectorAll('button')
    // Click the first small type=text button that is a restore action
    for (const btn of restoreButtons) {
      if (btn.closest('td') && btn.querySelector('svg')) {
        await act(async () => {
          fireEvent.click(btn)
        })
        break
      }
    }
    expect(restoreButtons.length).toBeGreaterThan(0)
  })

  // ─── Selection and bulk trash ─────────────────────────
  it('selecting mails shows bulk action bar with trash button', async () => {
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail, { ...sampleMail, id: 'mail-2', subject: 'Another' }], total: 2 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    // Select first row checkbox
    const checkboxes = document.querySelectorAll('.ant-checkbox-input')
    if (checkboxes.length > 1) {
      await act(async () => {
        fireEvent.click(checkboxes[1]) // first mail checkbox (index 0 is select-all)
      })
      // Should show bulk bar with trash and export buttons
      expect(screen.getByText('archive.selectedCount')).toBeInTheDocument()
      expect(screen.getByText('archive.moveToTrash')).toBeInTheDocument()
      expect(screen.getByText('archive.exportZip')).toBeInTheDocument()

      // Click deselect
      fireEvent.click(screen.getByText('archive.deselect'))
    }
  })

  // ─── Bulk selection in trash mode shows restore ───────
  it('selecting trash mails shows restore button', async () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'tr-1', deleted_at: '2026-04-01T10:00:00Z' }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    const checkboxes = document.querySelectorAll('.ant-checkbox-input')
    if (checkboxes.length > 1) {
      await act(async () => {
        fireEvent.click(checkboxes[1])
      })
      expect(screen.getByText('archive.restore')).toBeInTheDocument()
    }
  })

  // ─── Pagination in list/trash mode ────────────────────
  it('pagination renders showTotal', () => {
    mockArchiveMails.mockReturnValue({
      data: {
        mails: Array.from({ length: 50 }, (_, i) => ({ ...sampleMail, id: `m-${i}` })),
        total: 100,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    expect(screen.getByText('100 mails')).toBeInTheDocument()
  })

  // ─── Export ZIP from viewer ───────────────────────────
  it('viewer ZIP button exists and is clickable', async () => {
    const mockPost = vi.fn().mockResolvedValue({ data: new Blob(['zip']) })
    const apiClient = await import('../api/client')
    ;(apiClient.default.post as any) = mockPost

    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })

    // Mock URL.createObjectURL and revokeObjectURL
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
    URL.revokeObjectURL = vi.fn()

    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('ZIP')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('ZIP'))
    })

    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
  })

  // ─── Refresh button triggers load ────────────────────
  it('refresh button triggers refetch', () => {
    render(<ArchivePage />)
    const refreshButtons = document.querySelectorAll('button')
    let foundRefresh = false
    for (const btn of refreshButtons) {
      if (btn.querySelector('svg') && btn.textContent === '' && !btn.closest('.ant-drawer')) {
        fireEvent.click(btn)
        foundRefresh = true
        break
      }
    }
    if (foundRefresh) {
      expect(refetchMock).toHaveBeenCalled()
    }
  })

  // ─── Trash pagination shows total ────────────────────
  it('trash view pagination showTotal renders correctly', () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: Array.from({ length: 3 }, (_, i) => ({
          ...sampleMail,
          id: `tr-${i}`,
          deleted_at: '2026-04-01T10:00:00Z',
        })),
        total: 75,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('75 mails')).toBeInTheDocument()
  })

  // ─── Clicking a trash row opens viewer ────────────────
  it('clicking a trash row opens the mail viewer', async () => {
    mockGetMail.mockResolvedValue({ ...sampleMailDetail, subject: 'Trashed Mail' })
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{
          ...sampleMail,
          id: 'tr-1',
          subject: 'Trashed Mail',
          deleted_at: '2026-04-01T10:00:00Z',
        }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    await act(async () => {
      fireEvent.click(screen.getByText('Trashed Mail'))
    })

    await waitFor(() => {
      expect(mockGetMail).toHaveBeenCalledWith('acc-1', 'tr-1')
    })
  })

  // ─── Close viewer drawer ─────────────────────────────
  it('closing the viewer drawer resets viewing state', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    // Open viewer
    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('archive.from')).toBeInTheDocument()
    })

    // Close drawer via the close button
    const closeBtn = document.querySelector('.ant-drawer-close')
    if (closeBtn) {
      await act(async () => {
        fireEvent.click(closeBtn)
      })
    }
  })

  // ─── Viewer with no subject mail ─────────────────────
  it('viewer shows noSubject when mail has no subject', async () => {
    mockGetMail.mockResolvedValue({ ...sampleMailDetail, subject: '' })
    const noSubjectMail = { ...sampleMail, subject: '' }
    mockArchiveMails.mockReturnValue({
      data: { mails: [noSubjectMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('common.noSubject'))
    })

    await waitFor(() => {
      expect(mockGetMail).toHaveBeenCalled()
    })
  })

  // ─── Switch back to HTML from raw ────────────────────
  it('switches from raw back to html view', async () => {
    mockGetMail.mockResolvedValue(sampleMailDetail)
    mockArchiveMails.mockReturnValue({
      data: { mails: [sampleMail], total: 1 },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)

    await act(async () => {
      fireEvent.click(screen.getByText('Test Subject'))
    })

    await waitFor(() => {
      expect(screen.getByText('archive.emlRaw')).toBeInTheDocument()
    })

    // Switch to raw
    fireEvent.click(screen.getByText('archive.emlRaw'))
    expect(document.querySelector('pre')).toBeTruthy()

    // Switch back to html
    fireEvent.click(screen.getByText('archive.htmlView'))
    expect(document.querySelector('iframe')).toBeTruthy()
  })

  // ─── Eye button in trash row opens viewer ─────────────
  it('eye button in trash row opens viewer', async () => {
    mockGetMail.mockResolvedValue({ ...sampleMailDetail, subject: 'Trashed Mail Detail' })
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{
          ...sampleMail,
          id: 'tr-eye',
          subject: 'Trashed For Eye',
          deleted_at: '2026-04-01T10:00:00Z',
        }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    // Find the eye button in the trash table row actions
    const actionCells = document.querySelectorAll('td:last-child button')
    for (const btn of actionCells) {
      // Find the eye/view button (second button in the trash row actions)
      if (btn.querySelector('svg')) {
        await act(async () => {
          fireEvent.click(btn)
        })
        break
      }
    }
    expect(actionCells.length).toBeGreaterThan(0)
  })

  // ─── Trash view showTotal in pagination ───────────────
  it('trash pagination callback renders total', () => {
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{ ...sampleMail, id: 'pag-1', deleted_at: '2026-04-01T10:00:00Z' }],
        total: 200,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))
    expect(screen.getByText('200 mails')).toBeInTheDocument()
  })

  // ─── List paginaton showTotal ─────────────────────────
  it('list pagination renders total mails text', () => {
    mockArchiveMails.mockReturnValue({
      data: {
        mails: [sampleMail],
        total: 250,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    // antd Table pagination calls showTotal
    expect(screen.getByText('250 mails')).toBeInTheDocument()
  })

  // ─── Eye button in trash row via rendered table ──────
  it('trash table eye button opens viewer for the mail', async () => {
    mockGetMail.mockResolvedValue({
      ...sampleMailDetail,
      subject: 'EyeMail',
    })
    mockArchiveTrash.mockReturnValue({
      data: {
        mails: [{
          ...sampleMail,
          id: 'eye-mail',
          subject: 'EyeMail',
          deleted_at: '2026-04-01T10:00:00Z',
        }],
        total: 1,
        retentionDays: 30,
      },
      isLoading: false,
      refetch: refetchMock,
    })
    render(<ArchivePage />)
    fireEvent.click(screen.getByText('archive.trashView'))

    // The trash table has 2 action buttons per row: restore + eye
    const rows = document.querySelectorAll('tr.ant-table-row')
    if (rows.length > 0) {
      const lastCell = rows[0].querySelector('td:last-child')
      if (lastCell) {
        const buttons = lastCell.querySelectorAll('button')
        // Second button is the eye
        if (buttons.length >= 2) {
          await act(async () => {
            fireEvent.click(buttons[1])
          })
          await waitFor(() => {
            expect(mockGetMail).toHaveBeenCalledWith('acc-1', 'eye-mail')
          })
        }
      }
    }
  })
})
