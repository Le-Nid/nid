import { useEffect, useState, useRef, useCallback } from 'react'
import { createLogger } from '../utils/logger'

const logger = createLogger('sse')

export interface JobState {
  id: string
  bullmq_id: string
  type: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
  progress: number
  total: number
  processed: number
  error?: string
  completed_at?: string
}

export function useJobSSE(jobId: string | null) {
  const [job, setJob]         = useState<JobState | null>(null)
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const MAX_RETRIES = 5

  const connect = useCallback(() => {
    if (!jobId) return

    // Point 3: no more token in URL — httpOnly cookie is sent automatically
    const url = `/api/jobs/${jobId}/events`
    const es  = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      retriesRef.current = 0
    }

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setJob((prev) => ({ ...prev, ...data }))

        // Fermer si état terminal
        if (['completed', 'failed', 'cancelled'].includes(data.status)) {
          es.close()
          setConnected(false)
        }
      } catch {
        logger.warn('Failed to parse SSE message', { jobId: jobId ?? '' })
      }
    }

    es.onerror = () => {
      logger.warn('SSE connection error', { jobId: jobId ?? '' })
      setConnected(false)
      es.close()

      // Retry with exponential backoff unless job is terminal
      if (
        retriesRef.current < MAX_RETRIES &&
        (!job || !['completed', 'failed', 'cancelled'].includes(job.status))
      ) {
        const delay = Math.min(1000 * 2 ** retriesRef.current, 10_000)
        retriesRef.current++
        logger.info('SSE reconnecting', { jobId: jobId ?? '', attempt: retriesRef.current })
        retryTimerRef.current = setTimeout(connect, delay)
      }
    }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    retriesRef.current = 0
    connect()
    return () => {
      esRef.current?.close()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      setConnected(false)
      setJob(null)
    }
  }, [connect])

  return { job, connected }
}
