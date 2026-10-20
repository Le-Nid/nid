import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { create } from 'zustand'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}))

// Reactive account so the page re-renders in place (no remount) when it changes
const useMockAccount = create(() => ({ accountId: 'acc-1' }))
vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ accountId: useMockAccount((s) => s.accountId) }),
}))

const mockUseGmailMessages = vi.fn()
vi.mock('../hooks/queries', () => ({
  useGmailLabels: () => ({ data: [] }),
  useGmailMessages: (...args: any[]) => mockUseGmailMessages(...args),
  queryKeys: { gmailMessages: (...a: any[]) => ['gmail', ...a] },
}))

vi.mock('../components/GmailSearchInput', () => ({
  default: ({ value, onChange, onSearch }: any) => (
    <input
      data-testid="gmail-search"
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      onKeyDown={(e: any) => e.key === 'Enter' && onSearch(e.target.value)}
    />
  ),
}))
vi.mock('../components/BulkActionBar', () => ({
  default: ({ selected }: any) => <div data-testid="selected-count">{selected.length}</div>,
}))
vi.mock('../hooks/useInfiniteScroll', () => ({ useInfiniteScroll: () => ({ current: null }) }))
vi.mock('../components/MailViewer', () => ({ default: () => null }))
vi.mock('../components/JobProgressModal', () => ({
  default: ({ jobId, onClose }: any) => (jobId ? <button onClick={onClose}>close-job</button> : null),
}))
const mockBulkOperation = vi.fn()
vi.mock('../api', () => ({
  gmailApi: { bulkOperation: (...a: any[]) => mockBulkOperation(...a) },
  archiveApi: {},
  savedSearchesApi: {},
}))

import MailManagerPage from '../pages/MailManager'

const mail = { id: 'm1', threadId: 't1', subject: 'Hello', from: 'a@b.c', date: '2026-01-01', sizeEstimate: 10, snippet: '', labelIds: [], hasAttachments: false }

function setup(initialUrl = '/mails?q=from:alice', client = new QueryClient()) {
  const router = createMemoryRouter([{ path: '/mails', element: <MailManagerPage /> }], { initialEntries: [initialUrl] })
  const utils = render(
    <QueryClientProvider client={client}>
      <App><RouterProvider router={router} /></App>
    </QueryClientProvider>,
  )
  return { router, ...utils }
}

describe('MailManagerPage', () => {
  beforeEach(() => {
    useMockAccount.setState({ accountId: 'acc-1' })
    mockUseGmailMessages.mockReset()
    mockUseGmailMessages.mockReturnValue({
      data: { pages: [{ mails: [mail], total: 1 }] },
      isLoading: false, isFetching: false, isFetchingNextPage: false, hasNextPage: false,
      fetchNextPage: vi.fn(), refetch: vi.fn(),
    })
  })

  it('queries with the URL ?q= and follows it when it changes', async () => {
    const { router } = setup()
    expect(mockUseGmailMessages).toHaveBeenLastCalledWith('acc-1', 'from:alice', '')
    expect(screen.getByTestId('gmail-search')).toHaveValue('from:alice')

    await act(() => router.navigate('/mails?q=from:bob'))
    expect(mockUseGmailMessages).toHaveBeenLastCalledWith('acc-1', 'from:bob', '')
    expect(screen.getByTestId('gmail-search')).toHaveValue('from:bob')
  })

  it('clears the selection when the account changes', () => {
    setup()
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1')

    act(() => useMockAccount.setState({ accountId: 'acc-2' }))
    expect(mockUseGmailMessages).toHaveBeenLastCalledWith('acc-2', 'from:alice', '')
    expect(screen.getByTestId('selected-count')).toHaveTextContent('0')
  })

  it('refetches on refresh and when the same search is submitted again', () => {
    setup()
    const { refetch } = mockUseGmailMessages.mock.results.at(-1)!.value
    fireEvent.click(screen.getByRole('button', { name: 'common.refresh' }))
    fireEvent.keyDown(screen.getByTestId('gmail-search'), { key: 'Enter' })
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('reloads the list when the job progress modal closes after a row action', async () => {
    mockBulkOperation.mockResolvedValue({ jobId: 'job-1' })
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    setup('/mails?q=from:alice', client)

    fireEvent.click(screen.getAllByRole('row')[1].querySelectorAll('button')[0] as HTMLElement)
    fireEvent.click(await screen.findByText('mailManager.trashAction'))
    expect(mockBulkOperation).toHaveBeenCalledWith('acc-1', 'trash', ['m1'], undefined)

    fireEvent.click(await screen.findByText('close-job'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['gmail', 'acc-1', 'from:alice', ''] })
  })
})
