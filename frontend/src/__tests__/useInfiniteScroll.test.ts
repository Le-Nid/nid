import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

// Mock IntersectionObserver
const observeMock    = vi.fn()
const disconnectMock = vi.fn()
let observerCallback: IntersectionObserverCallback

beforeEach(() => {
  vi.clearAllMocks()
  window.IntersectionObserver = vi.fn((cb) => {
    observerCallback = cb
    return { observe: observeMock, disconnect: disconnectMock, unobserve: vi.fn() }
  }) as any
})

describe('useInfiniteScroll', () => {
  it('appelle onLoadMore quand le sentinel est visible et hasMore=true', () => {
    const onLoadMore = vi.fn()
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, loading: false })
    )

    // Simuler un élément réel attaché
    const div = document.createElement('div')
    ;(result.current as any).current = div

    // Déclencher l'observer
    observerCallback([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it("n'appelle pas onLoadMore si loading=true", () => {
    const onLoadMore = vi.fn()
    renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: true, loading: true })
    )
    observerCallback([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it("n'appelle pas onLoadMore si hasMore=false", () => {
    const onLoadMore = vi.fn()
    renderHook(() =>
      useInfiniteScroll({ onLoadMore, hasMore: false, loading: false })
    )
    observerCallback([{ isIntersecting: true }] as any, {} as any)
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})
