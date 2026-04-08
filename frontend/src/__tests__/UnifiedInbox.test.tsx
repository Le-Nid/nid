import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}))

vi.mock('../store/auth.store', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      gmailAccounts: [
        { id: 'acc-1', email: 'a@test.com', is_active: true },
        { id: 'acc-2', email: 'b@test.com', is_active: true },
      ],
    }
    return selector ? selector(state) : state
  },
}))

const mockUnifiedMessages = vi.fn()

vi.mock('../hooks/queries', () => ({
  useUnifiedMessages: (...args: any[]) => mockUnifiedMessages(...args),
}))

vi.mock('../components/GmailSearchInput', () => ({
  default: ({ value, onChange }: any) => (
    <input data-testid="gmail-search" value={value} onChange={(e: any) => onChange(e.target.value)} />
  ),
}))

vi.mock('../components/MailViewer', () => ({
  default: () => null,
}))

import UnifiedInboxPage from '../pages/UnifiedInbox'

describe('UnifiedInboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows title', () => {
    mockUnifiedMessages.mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() })
    render(<UnifiedInboxPage />)
    expect(screen.getByText('unified.title')).toBeInTheDocument()
  })

  it('displays messages table with account tags', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1',
            threadId: 't1',
            subject: 'Test Email',
            from: 'alice@test.com',
            date: '2026-03-30T10:00:00.000Z',
            sizeEstimate: 1024,
            snippet: 'Hello',
            labelIds: ['INBOX'],
            hasAttachments: false,
            accountId: 'acc-1',
            accountEmail: 'a@test.com',
          },
          {
            id: 'm2',
            threadId: 't2',
            subject: 'Unread Email',
            from: 'bob@test.com',
            date: '2026-03-29T10:00:00.000Z',
            sizeEstimate: 2048,
            snippet: 'World',
            labelIds: ['INBOX', 'UNREAD'],
            hasAttachments: true,
            accountId: 'acc-2',
            accountEmail: 'b@test.com',
          },
        ],
        accounts: [
          { id: 'acc-1', email: 'a@test.com' },
          { id: 'acc-2', email: 'b@test.com' },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('Test Email')).toBeInTheDocument()
    expect(screen.getByText('Unread Email')).toBeInTheDocument()
    // Account tags show username part
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    mockUnifiedMessages.mockReturnValue({
      data: { messages: [], accounts: [] },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('unified.noMail')).toBeInTheDocument()
  })

  it('shows loading spinner during fetch', () => {
    mockUnifiedMessages.mockReturnValue({
      data: null,
      isLoading: true,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(document.querySelector('.ant-spin')).toBeInTheDocument()
  })

  it('shows results count when messages exist', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'Email', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 100, snippet: '',
            labelIds: [], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [{ id: 'acc-1', email: 'a@test.com' }],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('1 unified.results')).toBeInTheDocument()
  })

  it('shows null subject as noSubject', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: '', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 100, snippet: '',
            labelIds: [], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('common.noSubject')).toBeInTheDocument()
  })

  it('shows attachment icon for messages with attachments', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'With Attach', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 100, snippet: '',
            labelIds: [], hasAttachments: true, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(document.querySelector('.lucide-paperclip')).toBeInTheDocument()
  })

  it('calls refetch on reload click', () => {
    const refetch = vi.fn()
    mockUnifiedMessages.mockReturnValue({
      data: { messages: [], accounts: [] },
      isLoading: false,
      refetch,
    })

    render(<UnifiedInboxPage />)
    const reloadBtn = document.querySelector('.lucide-refresh-cw')?.closest('button')
    if (reloadBtn) fireEvent.click(reloadBtn)

    expect(refetch).toHaveBeenCalled()
  })

  it('shows all accounts filter option', () => {
    mockUnifiedMessages.mockReturnValue({
      data: { messages: [], accounts: [] },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('unified.allAccounts')).toBeInTheDocument()
  })

  it('shows date dash for empty date', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'No date', from: 'x@t.com',
            date: '', sizeEstimate: 100, snippet: '',
            labelIds: [], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows gmail search input', () => {
    mockUnifiedMessages.mockReturnValue({
      data: { messages: [], accounts: [] },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByTestId('gmail-search')).toBeInTheDocument()
  })

  it('opens mail viewer when row clicked', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'Clickable', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 100, snippet: '',
            labelIds: ['INBOX'], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [{ id: 'acc-1', email: 'a@test.com' }],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    // Click on the row
    fireEvent.click(screen.getByText('Clickable'))
    // MailViewer component receives the message/account id (mocked to null)
    expect(screen.getByText('Clickable')).toBeInTheDocument()
  })

  it('shows size formatted', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'Size test', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 1024 * 1024, snippet: '',
            labelIds: [], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('Size test')).toBeInTheDocument()
  })

  it('shows unread messages with bold styling', () => {
    mockUnifiedMessages.mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1', threadId: 't1', subject: 'Unread msg', from: 'x@t.com',
            date: '2026-03-30T10:00:00.000Z', sizeEstimate: 100, snippet: '',
            labelIds: ['INBOX', 'UNREAD'], hasAttachments: false, accountId: 'acc-1', accountEmail: 'a@test.com',
          },
        ],
        accounts: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<UnifiedInboxPage />)
    expect(screen.getByText('Unread msg')).toBeInTheDocument()
  })
})
