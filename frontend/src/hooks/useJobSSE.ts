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

  const connect = useCallback(() => {
    if (!jobId) return

    // Point 3: no more token in URL — httpOnly cookie is sent automatically
    const url = `/api/jobs/${jobId}/events`
    const es  = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.onopen = () => setConnected(true)

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
    }
  }, [jobId])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      setConnected(false)
      setJob(null)
    }
  }, [connect])

  return { job, connected }
}
