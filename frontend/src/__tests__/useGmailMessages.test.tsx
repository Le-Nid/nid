import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const listMessages = vi.fn()
const batchGetMessages = vi.fn()

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  gmailApi: {
    listMessages: (...a: any[]) => listMessages(...a),
    batchGetMessages: (...a: any[]) => batchGetMessages(...a),
  },
}))

import { useGmailMessages } from '../hooks/queries'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useGmailMessages', () => {
  beforeEach(() => {
    listMessages.mockReset()
    batchGetMessages.mockReset()
  })

  it('loads a page (list + batchGet) and follows nextPageToken', async () => {
    listMessages
      .mockResolvedValueOnce({ messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'tok2', resultSizeEstimate: 42 })
      .mockResolvedValueOnce({ messages: [{ id: 'c' }], resultSizeEstimate: 42 })
    batchGetMessages.mockImplementation(async (_acc: string, ids: string[]) => ids.map((id) => ({ id })))

    const { result } = renderHook(() => useGmailMessages('acc-1', 'from:x', 'is:unread'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listMessages).toHaveBeenCalledWith('acc-1', { q: 'is:unread from:x', maxResults: 20, pageToken: undefined })
    expect(batchGetMessages).toHaveBeenCalledWith('acc-1', ['a', 'b'])
    expect(result.current.data!.pages[0].total).toBe(42)
    expect(result.current.hasNextPage).toBe(true)

    await act(() => result.current.fetchNextPage())
    expect(listMessages).toHaveBeenLastCalledWith('acc-1', { q: 'is:unread from:x', maxResults: 20, pageToken: 'tok2' })
    await waitFor(() => expect(result.current.data!.pages).toHaveLength(2))
    expect(result.current.data!.pages.flatMap((p) => p.mails).map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('skips batchGet on an empty page and sends no q when empty', async () => {
    listMessages.mockResolvedValueOnce({ resultSizeEstimate: 0 })

    const { result } = renderHook(() => useGmailMessages('acc-1', '', ''), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listMessages).toHaveBeenCalledWith('acc-1', { q: undefined, maxResults: 20, pageToken: undefined })
    expect(batchGetMessages).not.toHaveBeenCalled()
    expect(result.current.data!.pages[0].mails).toEqual([])
  })

  it('does not fetch without an account', () => {
    renderHook(() => useGmailMessages(null, '', ''), { wrapper })
    expect(listMessages).not.toHaveBeenCalled()
  })
})
