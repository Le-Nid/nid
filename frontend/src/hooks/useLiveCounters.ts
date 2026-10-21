import { useEffect, useState } from 'react'

/** `counters` event of GET /api/events (B3, D6). `mails`: total per Gmail account, null when Gmail could not answer. */
export interface LiveCounters {
  mails: Record<string, number | null>
  activeRules: number
  activeJobs: number
}

/** Sidebar counters pushed by the server; the browser reconnects the EventSource on its own. */
export function useLiveCounters(): LiveCounters | null {
  const [counters, setCounters] = useState<LiveCounters | null>(null)

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/events', { withCredentials: true })
    es.addEventListener('counters', (e) => {
      try {
        setCounters(JSON.parse((e as MessageEvent).data))
      } catch {
        // malformed frame: keep the last good counters
      }
    })
    return () => es.close()
  }, [])

  return counters
}
