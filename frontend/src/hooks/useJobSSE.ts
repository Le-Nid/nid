import { useEffect, useState, useRef, useCallback } from 'react'

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

    const token = localStorage.getItem('token')
    // EventSource ne supporte pas les headers custom — on passe le token en query
    const url = `/api/jobs/${jobId}/events?token=${token}`
    const es  = new EventSource(url)
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
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
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
