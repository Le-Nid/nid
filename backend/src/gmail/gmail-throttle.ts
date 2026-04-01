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
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status ?? err?.status
      const isRetryable = status === 429 || status === 503 || status === 500

      if (isRetryable && attempt < retries) {
        const retryAfterMs = parseRetryAfter(err)
        const expDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS)
        const jitter = Math.random() * 1_000
        const delay = retryAfterMs ?? (expDelay + jitter)
        console.warn(
          `[gmail-throttle] ${status} on attempt ${attempt + 1}/${retries + 1}, retrying in ${Math.round(delay)}ms`
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

function parseRetryAfter(err: any): number | null {
  const raw =
    err?.response?.headers?.['retry-after'] ??
    err?.response?.headers?.get?.('retry-after')
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
  private queue: (() => void)[] = []
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
 */
export async function withAccountLimit<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const sem = accountSemaphore(accountId)
  await sem.acquire()
  try {
    return await fn()
  } finally {
    sem.release()
  }
}
