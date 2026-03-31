/**
 * Gmail API rate-limit handling.
 *
 * Google quotas (default):
 *   - 250 quota units / user / second
 *   - Most endpoints cost 5 units per call
 *   → ~50 requests / user / second max
 *
 * This module provides:
 *   1. `gmailRetry`  – retries on 429 with exponential backoff + jitter
 *   2. `pThrottle`   – limits per-account concurrency to stay under quota
 */

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 60_000

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
