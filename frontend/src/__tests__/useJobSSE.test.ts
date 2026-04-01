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
})
