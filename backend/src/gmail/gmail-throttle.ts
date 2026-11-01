/**
 * Gmail API rate-limit handling.
 *
 * Google quotas (default):
 *   - 250 quota units / user / second
 *   - Most endpoints cost 5 units per call
 *   → ~50 requests / user / second max
 *
 * This module provides:
 *   1. `gmailRetry`       – retries on 429 with exponential backoff + jitter
 *   2. `limitConcurrency`  – generic concurrency limiter (per-call)
 *   3. `accountSemaphore`  – global per-account concurrency limiter (shared across all routes)
 */

import { createLogger } from '../logger'
import { getRedis } from '../plugins/redis'

const logger = createLogger('gmail-throttle')

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 60_000
const GLOBAL_CONCURRENCY = 5

/**
 * Wraps a Gmail API call with retry logic for 429 (rate limit) and
 * 5xx (transient server) errors.  Uses exponential backoff with jitter.
 */
export async function gmailRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const errObj = err as Record<string, any>
      const status = errObj?.code ?? errObj?.response?.status ?? errObj?.status
      // Gmail also signals rate limits as 403 with a rateLimitExceeded / userRateLimitExceeded reason
      const reason = errObj?.errors?.[0]?.reason ?? errObj?.response?.data?.error?.errors?.[0]?.reason
      const isRateLimit403 = status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')
      const isRateLimit = status === 429 || isRateLimit403
      const isRetryable = isRateLimit || status === 503 || status === 500

      if (isRetryable && attempt < retries) {
        if (isRateLimit) void countRateLimited()
        const retryAfterMs = parseRetryAfter(err)
        const expDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS)
        const jitter = Math.random() * 1_000
        const delay = retryAfterMs ?? (expDelay + jitter)
        logger.warn(
          `${status} on attempt ${attempt + 1}/${retries + 1}, retrying in ${Math.round(delay)}ms`
        )
        await sleep(delay)
        continue
      }
      throw err
    }
  }
  throw new Error('gmailRetry: unreachable')
}

/**
 * Execute an array of tasks with limited concurrency.
 * Returns results in the same order as the input.
 */
export async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ─── Rate-limit counter (B13) ───────────────────────────
// Hourly Redis buckets kept 25 h, shared by the API and the worker; summed by the admin quota view.
const HOUR_MS = 3_600_000
const rateLimitKey = (hour: number) => `gmail:rate-limited:${hour}`

/** Count one retried rate-limited response. Never rejects: monitoring must not break a Gmail call. */
async function countRateLimited(): Promise<void> {
  try {
    const key = rateLimitKey(Math.floor(Date.now() / HOUR_MS))
    await getRedis().multi().incr(key).expire(key, 25 * 3600).exec()
  } catch (err) {
    logger.debug({ err }, 'rate-limit counter unavailable')
  }
}

/** Rate-limited responses retried over the last 24 hourly buckets. */
export async function rateLimitedLast24h(): Promise<number> {
  const now = Math.floor(Date.now() / HOUR_MS)
  const keys = Array.from({ length: 24 }, (_, i) => rateLimitKey(now - i))
  const values = await getRedis().mget(...keys)
  return values.reduce((sum, v) => sum + Number(v ?? 0), 0)
}

function parseRetryAfter(err: unknown): number | null {
  const errObj = err as Record<string, any>
  const raw =
    errObj?.response?.headers?.['retry-after'] ??
    errObj?.response?.headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number.parseInt(String(raw), 10)
  return Number.isNaN(seconds) ? null : seconds * 1_000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Global per-account semaphore ───────────────────────
// Ensures ALL Gmail API calls for the same account share a
// single concurrency pool, regardless of which route/service
// triggered them.  Prevents Google's implicit throttling that
// occurs when too many concurrent connections come from the
// same OAuth token.

class Semaphore {
  private readonly queue: (() => void)[] = []
  private running = 0

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

const semaphores = new Map<string, Semaphore>()

/**
 * Get (or create) a global concurrency semaphore for a given account.
 * All Gmail API calls for the same account share this limiter.
 */
export function accountSemaphore(accountId: string): Semaphore {
  let sem = semaphores.get(accountId)
  if (!sem) {
    sem = new Semaphore(GLOBAL_CONCURRENCY)
    semaphores.set(accountId, sem)
  }
  return sem
}

/**
 * Run a task through the per-account global semaphore.
 * Use this for every Gmail API call to ensure global concurrency control.
 * Optionally tracks the API call for quota monitoring.
 */
export async function withAccountLimit<T>(
  accountId: string,
  fn: () => Promise<T>,
  endpoint?: string,
): Promise<T> {
  const sem = accountSemaphore(accountId)
  await sem.acquire()
  try {
    const result = await fn()
    // Fire-and-forget quota tracking
    if (endpoint) {
      import('./quota.service')
        .then(({ trackApiCall }) => trackApiCall(accountId, endpoint))
        .catch(() => {}) // a failed import or insert must not become an unhandled rejection
    }
    return result
  } finally {
    sem.release()
  }
}
