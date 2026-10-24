import { Registry, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'
import { getQueue } from '../jobs/queue'
import { rateLimitedLast24h } from '../gmail/gmail-throttle'

/** Prometheus registry of the backend process (API and BullMQ worker run in the same process). */
export const registry = new Registry()
collectDefaultMetrics({ register: registry, prefix: 'nid_' })

export const httpDuration = new Histogram({
  name: 'nid_http_request_duration_seconds',
  help: 'HTTP request duration, by route pattern (never the raw URL: ids would explode the cardinality)',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
})

const JOB_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

const queueJobs = new Gauge({
  name: 'nid_queue_jobs',
  help: 'BullMQ jobs by state (completed/failed are capped by removeOnComplete/removeOnFail)',
  labelNames: ['state'] as const,
  registers: [registry],
})
const rateLimited = new Gauge({
  name: 'nid_gmail_rate_limited_24h',
  help: 'Gmail API calls refused with 429/rateLimitExceeded over the last 24 hours',
  registers: [registry],
})
const redisUp = new Gauge({
  name: 'nid_redis_up',
  help: '0 when Redis could not be read for this scrape: nid_queue_jobs and nid_gmail_rate_limited_24h are stale',
  registers: [registry],
})

/**
 * Reads the Redis-backed values first, then renders. Not in collect() callbacks: prom-client runs those in
 * parallel and one rejection fails the whole scrape, losing the process metrics exactly when Redis is down.
 */
export async function renderMetrics(): Promise<string> {
  try {
    const [counts, limited] = await Promise.all([getQueue().getJobCounts(...JOB_STATES), rateLimitedLast24h()])
    for (const state of JOB_STATES) queueJobs.set({ state }, counts[state] ?? 0)
    rateLimited.set(limited)
    redisUp.set(1)
  } catch {
    redisUp.set(0)
  }
  return registry.metrics()
}
