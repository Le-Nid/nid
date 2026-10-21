import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { rulesApi, unsubscribeApi } from '../api'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  unsubscribeApi: { getNewsletters: vi.fn() },
  rulesApi: { preview: vi.fn(), create: vi.fn() },
}))

import { useCreateRule, useNewsletters, useRulePreview } from '../hooks/queries'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

beforeEach(() => {
  vi.clearAllMocks()
  client.clear()
})

describe('useNewsletters', () => {
  it('reads the cached scan, and waits for an account', async () => {
    vi.mocked(unsubscribeApi.getNewsletters).mockResolvedValue({ senders: [], scannedAt: null })
    renderHook(() => useNewsletters(null), { wrapper })
    expect(unsubscribeApi.getNewsletters).not.toHaveBeenCalled()
    const { result } = renderHook(() => useNewsletters('acc-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ senders: [], scannedAt: null }))
    expect(unsubscribeApi.getNewsletters).toHaveBeenCalledWith('acc-1')
  })
})

describe('useRulePreview', () => {
  it('previews the conditions, only once they are known', async () => {
    vi.mocked(rulesApi.preview).mockResolvedValue({ estimatedCount: 3 })
    renderHook(() => useRulePreview('acc-1', null), { wrapper })
    expect(rulesApi.preview).not.toHaveBeenCalled()
    const conditions = [{ field: 'from', operator: 'contains', value: 'a@b.c' }]
    const { result } = renderHook(() => useRulePreview('acc-1', conditions), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ estimatedCount: 3 }))
    expect(rulesApi.preview).toHaveBeenCalledWith('acc-1', conditions)
  })
})

describe('useCreateRule', () => {
  it('creates the rule and refreshes the rule list', async () => {
    vi.mocked(rulesApi.create).mockResolvedValue({ id: 'r1' })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateRule('acc-1'), { wrapper })
    await act(() => result.current.mutateAsync({ name: 'x' }))
    expect(rulesApi.create).toHaveBeenCalledWith('acc-1', { name: 'x' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules', 'acc-1'] })
  })
})
