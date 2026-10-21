import { act, renderHook } from '@testing-library/react'
import { useLiveCounters } from '../hooks/useLiveCounters'

class FakeEventSource {
  static last: FakeEventSource
  listeners: Record<string, (e: { data: string }) => void> = {}
  constructor(public url: string, public init?: EventSourceInit) { FakeEventSource.last = this }
  addEventListener(type: string, fn: (e: { data: string }) => void) { this.listeners[type] = fn }
  close = vi.fn()
}

afterEach(() => { delete (globalThis as any).EventSource })

describe('useLiveCounters', () => {
  it('returns null and opens nothing without EventSource support', () => {
    const { result } = renderHook(() => useLiveCounters())
    expect(result.current).toBeNull()
  })

  it('opens /api/events with the session cookie and keeps the last valid counters', () => {
    (globalThis as any).EventSource = FakeEventSource
    const { result, unmount } = renderHook(() => useLiveCounters())
    const es = FakeEventSource.last
    expect(es.url).toBe('/api/events')
    expect(es.init).toEqual({ withCredentials: true })

    const counters = { mails: { a1: 10 }, activeRules: 2, activeJobs: 1 }
    act(() => es.listeners.counters({ data: JSON.stringify(counters) }))
    expect(result.current).toEqual(counters)

    act(() => es.listeners.counters({ data: 'not json' }))
    expect(result.current).toEqual(counters)

    unmount()
    expect(es.close).toHaveBeenCalled()
  })
})
