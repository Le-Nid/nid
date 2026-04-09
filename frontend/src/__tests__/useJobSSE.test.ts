import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJobSSE } from '../hooks/useJobSSE'

// Mock EventSource
let esInstance: any = null
class MockEventSource {
  url: string
  withCredentials: boolean
  onopen: (() => void) | null = null
  onmessage: ((e: any) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = opts?.withCredentials ?? false
    esInstance = this
  }
}

beforeEach(() => {
  esInstance = null
  ;(globalThis as any).EventSource = MockEventSource
})

afterEach(() => {
  delete (globalThis as any).EventSource
})

describe('useJobSSE', () => {
  it('returns null job and false connected when jobId is null', () => {
    const { result } = renderHook(() => useJobSSE(null))
    expect(result.current.job).toBeNull()
    expect(result.current.connected).toBe(false)
  })

  it('connects to SSE endpoint when jobId is provided', () => {
    renderHook(() => useJobSSE('job-123'))
    expect(esInstance).not.toBeNull()
    expect(esInstance.url).toBe('/api/jobs/job-123/events')
    expect(esInstance.withCredentials).toBe(true)
  })

  it('sets connected to true on open', () => {
    const { result } = renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onopen?.()
    })

    expect(result.current.connected).toBe(true)
  })

  it('updates job state on message', () => {
    const { result } = renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onmessage?.({
        data: JSON.stringify({ id: 'job-123', status: 'active', progress: 50, total: 100, processed: 50 }),
      })
    })

    expect(result.current.job).toMatchObject({ status: 'active', progress: 50 })
  })

  it('closes connection on terminal status (completed)', () => {
    const { result } = renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onmessage?.({
        data: JSON.stringify({ status: 'completed', progress: 100, total: 100, processed: 100 }),
      })
    })

    expect(esInstance.close).toHaveBeenCalled()
    expect(result.current.connected).toBe(false)
  })

  it('closes connection on terminal status (failed)', () => {
    renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onmessage?.({
        data: JSON.stringify({ status: 'failed', error: 'some error' }),
      })
    })

    expect(esInstance.close).toHaveBeenCalled()
  })

  it('closes connection on terminal status (cancelled)', () => {
    renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onmessage?.({
        data: JSON.stringify({ status: 'cancelled' }),
      })
    })

    expect(esInstance.close).toHaveBeenCalled()
  })

  it('handles connection error', () => {
    const { result } = renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onopen?.()
    })
    expect(result.current.connected).toBe(true)

    act(() => {
      esInstance.onerror?.()
    })
    expect(result.current.connected).toBe(false)
    expect(esInstance.close).toHaveBeenCalled()
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useJobSSE('job-123'))
    unmount()
    expect(esInstance.close).toHaveBeenCalled()
  })

  it('ignores invalid JSON in messages', () => {
    const { result } = renderHook(() => useJobSSE('job-123'))

    act(() => {
      esInstance.onmessage?.({ data: 'not json' })
    })

    // Should not crash, job stays null
    expect(result.current.job).toBeNull()
  })

  it('retries on error with exponential backoff', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useJobSSE('job-retry'))
    const firstInstance = esInstance

    // Trigger an error
    act(() => {
      esInstance.onerror?.()
    })

    expect(firstInstance.close).toHaveBeenCalled()
    expect(result.current.connected).toBe(false)

    // Advance past first retry delay (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // A new EventSource should have been created
    expect(esInstance).not.toBe(firstInstance)
    expect(esInstance.url).toBe('/api/jobs/job-retry/events')

    vi.useRealTimers()
  })

  it('stops retrying when max retries exceeded', () => {
    vi.useFakeTimers()
    renderHook(() => useJobSSE('job-exhaust'))

    // Exhaust all retries
    for (let i = 0; i < 5; i++) {
      act(() => { esInstance.onerror?.() })
      act(() => { vi.advanceTimersByTime(20_000) })
    }

    const lastInstance = esInstance

    // One more error should NOT retry
    act(() => { esInstance.onerror?.() })
    act(() => { vi.advanceTimersByTime(20_000) })

    // Should still be the same instance (no new connection)
    expect(esInstance).toBe(lastInstance)

    vi.useRealTimers()
  })

  it('does not retry when job is in terminal state', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useJobSSE('job-terminal'))

    // Set job to completed state
    act(() => {
      esInstance.onmessage?.({
        data: JSON.stringify({ status: 'completed', progress: 100, total: 10, processed: 10 }),
      })
    })

    expect(result.current.job?.status).toBe('completed')

    vi.useRealTimers()
  })

  it('resets retry counter on successful open', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useJobSSE('job-reset'))

    // Trigger error then retry
    act(() => { esInstance.onerror?.() })
    act(() => { vi.advanceTimersByTime(1000) })

    // Successful open should reset counter
    act(() => { esInstance.onopen?.() })
    expect(result.current.connected).toBe(true)

    vi.useRealTimers()
  })

  it('cleans up retry timer on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useJobSSE('job-cleanup'))

    // Trigger error to start retry timer
    act(() => { esInstance.onerror?.() })

    // Unmount should clean up
    unmount()
    expect(esInstance.close).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
