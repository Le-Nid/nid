import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test gmailRetry and limitConcurrency (pure logic) ─────
// We need to import WITHOUT the setup.ts mock since it only mocks config
// These are pure utility functions, no DB/Redis needed

// We import directly to test the actual logic
import { gmailRetry, limitConcurrency, accountSemaphore, withAccountLimit } from '../gmail/gmail-throttle'

describe('gmailRetry', () => {
  it('returns result on success', async () => {
    const result = await gmailRetry(() => Promise.resolve('ok'))
    expect(result).toBe('ok')
  })

  it('retries on 429 error', async () => {
    let attempt = 0
    const fn = () => {
      attempt++
      if (attempt < 3) throw Object.assign(new Error('rate limited'), { code: 429 })
      return Promise.resolve('success')
    }

    const result = await gmailRetry(fn, 5)
    expect(result).toBe('success')
    expect(attempt).toBe(3)
  })

  it('retries on 500 error', async () => {
    let attempt = 0
    const fn = () => {
      attempt++
      if (attempt < 2) throw Object.assign(new Error('server error'), { code: 500 })
      return Promise.resolve('ok')
    }

    const result = await gmailRetry(fn, 3)
    expect(result).toBe('ok')
  })

  it('retries on 503 error', async () => {
    let attempt = 0
    const fn = () => {
      attempt++
      if (attempt < 2) throw Object.assign(new Error('unavailable'), { code: 503 })
      return Promise.resolve('recovered')
    }

    const result = await gmailRetry(fn, 3)
    expect(result).toBe('recovered')
  })

  it('throws on non-retryable error', async () => {
    const fn = () => {
      throw Object.assign(new Error('not found'), { code: 404 })
    }

    await expect(gmailRetry(fn)).rejects.toThrow('not found')
  })

  it('throws after max retries', async () => {
    const fn = () => {
      throw Object.assign(new Error('rate limited'), { code: 429 })
    }

    await expect(gmailRetry(fn, 1)).rejects.toThrow('rate limited')
  })

  it('handles response.status format', async () => {
    let attempt = 0
    const fn = () => {
      attempt++
      if (attempt < 2) throw { response: { status: 429 }, message: 'throttled' }
      return Promise.resolve('ok')
    }

    const result = await gmailRetry(fn, 3)
    expect(result).toBe('ok')
  })

  it('respects retry-after header', async () => {
    let attempt = 0
    const fn = () => {
      attempt++
      if (attempt < 2) {
        throw Object.assign(new Error('rate limited'), {
          code: 429,
          response: { headers: { 'retry-after': '1' } },
        })
      }
      return Promise.resolve('ok')
    }

    const result = await gmailRetry(fn, 3)
    expect(result).toBe('ok')
  })
})

describe('limitConcurrency', () => {
  it('executes all tasks and returns results in order', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ]

    const results = await limitConcurrency(tasks, 2)
    expect(results).toEqual([1, 2, 3])
  })

  it('handles empty task list', async () => {
    const results = await limitConcurrency([], 5)
    expect(results).toEqual([])
  })

  it('limits concurrency to specified value', async () => {
    let maxConcurrent = 0
    let current = 0

    const tasks = Array.from({ length: 10 }, () => async () => {
      current++
      maxConcurrent = Math.max(maxConcurrent, current)
      await new Promise((r) => setTimeout(r, 10))
      current--
      return 'done'
    })

    await limitConcurrency(tasks, 3)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('handles single task', async () => {
    const results = await limitConcurrency([() => Promise.resolve(42)], 1)
    expect(results).toEqual([42])
  })
})

describe('accountSemaphore', () => {
  it('returns the same semaphore for the same account', () => {
    const s1 = accountSemaphore('acc-1')
    const s2 = accountSemaphore('acc-1')
    expect(s1).toBe(s2)
  })

  it('returns different semaphores for different accounts', () => {
    const s1 = accountSemaphore('acc-a')
    const s2 = accountSemaphore('acc-b')
    expect(s1).not.toBe(s2)
  })
})

describe('withAccountLimit', () => {
  it('executes function and returns result', async () => {
    const result = await withAccountLimit('acc-1', () => Promise.resolve('result'))
    expect(result).toBe('result')
  })

  it('releases semaphore even on error', async () => {
    try {
      await withAccountLimit('acc-error', () => {
        throw new Error('fail')
      })
    } catch {
      // expected
    }

    // Should be able to acquire again
    const result = await withAccountLimit('acc-error', () => Promise.resolve('ok'))
    expect(result).toBe('ok')
  })
})
