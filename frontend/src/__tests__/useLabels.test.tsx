import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import api from '../api/client'
import { useLabels } from '../hooks/queries'

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLabels', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the synced labels of the account', async () => {
    const labels = [{ id: 'Label_1', name: 'Factures', type: 'user', color_bg: '#16a765', archived_count: 3 }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: labels })

    const { result } = renderHook(() => useLabels('acc-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.get).toHaveBeenCalledWith('/api/labels/acc-1')
    expect(result.current.data).toEqual(labels)
  })

  it('stays idle without an account', () => {
    const { result } = renderHook(() => useLabels(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.get).not.toHaveBeenCalled()
  })
})
