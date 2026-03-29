import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

// Mock IntersectionObserver
const observeMock    = vi.fn()
const disconnectMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

// Component de test qui utilise le hook
function TestComponent({ onLoadMore, hasMore, loading }: any) {
  const sentinelRef = useInfiniteScroll({ onLoadMore, hasMore, loading })
  return <div ref={sentinelRef} data-testid="sentinel">Sentinel</div>
}

describe('useInfiniteScroll', () => {
  it('appelle onLoadMore quand le sentinel est visible et hasMore=true', async () => {
    let observerCallback: IntersectionObserverCallback | null = null
    window.IntersectionObserver = vi.fn((cb) => {
      observerCallback = cb
      return { observe: observeMock, disconnect: disconnectMock, unobserve: vi.fn() }
    }) as any

    const onLoadMore = vi.fn()
    render(
      <TestComponent onLoadMore={onLoadMore} hasMore={true} loading={false} />
    )

    await waitFor(() => expect(observeMock).toHaveBeenCalled())

    expect(observerCallback).toBeDefined()
    observerCallback?.([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it("n'appelle pas onLoadMore si loading=true", async () => {
    let observerCallback: IntersectionObserverCallback | null = null
    window.IntersectionObserver = vi.fn((cb) => {
      observerCallback = cb
      return { observe: observeMock, disconnect: disconnectMock, unobserve: vi.fn() }
    }) as any

    const onLoadMore = vi.fn()
    render(
      <TestComponent onLoadMore={onLoadMore} hasMore={true} loading={true} />
    )

    await waitFor(() => expect(observeMock).toHaveBeenCalled())

    expect(observerCallback).toBeDefined()
    observerCallback?.([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it("n'appelle pas onLoadMore si hasMore=false", async () => {
    let observerCallback: IntersectionObserverCallback | null = null
    window.IntersectionObserver = vi.fn((cb) => {
      observerCallback = cb
      return { observe: observeMock, disconnect: disconnectMock, unobserve: vi.fn() }
    }) as any

    const onLoadMore = vi.fn()
    render(
      <TestComponent onLoadMore={onLoadMore} hasMore={false} loading={false} />
    )

    await waitFor(() => expect(observeMock).toHaveBeenCalled())

    expect(observerCallback).toBeDefined()
    observerCallback?.([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})
