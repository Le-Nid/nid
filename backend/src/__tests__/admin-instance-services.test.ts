// ─── Services behind Admin > Système (B13, B15, integrity summary) ─────

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const calls: { method: string; args: unknown[] }[] = []
const eb = { fn: { countAll: () => ({ as: () => ({}) }), sum: () => ({ as: () => ({}) }), min: () => ({ as: () => ({}) }) } }
const chainable = (): any => {
  const chain: any = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      return (...args: unknown[]) => {
        calls.push({ method: prop, args })
        for (const a of args) if (typeof a === 'function') a(prop === 'onConflict' ? { column: () => ({ doUpdateSet: () => ({}) }) } : eb)
        return chain
      }
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockSqlExecute = vi.fn()
vi.mock('kysely', async () => ({ ...(await vi.importActual<object>('kysely')), sql: () => ({ execute: mockSqlExecute }) }))

const redis = {
  mget: vi.fn(),
  exec: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  multi: vi.fn(),
}
redis.multi.mockReturnValue(redis)
redis.incr.mockReturnValue(redis)
redis.expire.mockReturnValue(redis)
let redisReady = true
vi.mock('../plugins/redis', () => ({
  getRedis: () => {
    if (!redisReady) throw new Error('Redis not initialized')
    return redis
  },
}))

const mockDeleteFile = vi.fn()
vi.mock('../storage/storage.service', () => ({ getLocalStorage: () => ({ deleteFile: mockDeleteFile }) }))

import { getInstanceQuotaStats } from '../gmail/quota.service'
import { gmailRetry, rateLimitedLast24h } from '../gmail/gmail-throttle'
import { emptyAllArchiveTrash, getArchiveTrashSummary, purgeArchiveTrash } from '../archive/trash.service'
import { getLastIntegrityCheck, saveIntegrityResult } from '../archive/integrity.service'

beforeEach(() => {
  vi.clearAllMocks()
  redis.multi.mockReturnValue(redis)
  redis.incr.mockReturnValue(redis)
  redis.expire.mockReturnValue(redis)
  calls.length = 0
  redisReady = true
})

describe('instance quota (B13)', () => {
  it('aggregates the day, the busiest mailbox-second and the 429s of 24 h', async () => {
    mockSqlExecute
      .mockResolvedValueOnce({ rows: [{ units: 1200, calls: 240 }] })
      .mockResolvedValueOnce({ rows: [{ email: 'busy@gmail.com', units: 180 }] })
    redis.mget.mockResolvedValue(['2', null, '3', ...Array(21).fill(null)])

    expect(await getInstanceQuotaStats()).toEqual({
      day: { units: 1200, calls: 240, limit: 1_000_000_000 },
      peakPerSecond: { units: 180, account: 'busy@gmail.com', limit: 250 },
      rateLimited24h: 5,
    })
    expect(redis.mget.mock.calls[0]).toHaveLength(24)
  })

  it('reports zeros on an idle instance', async () => {
    mockSqlExecute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    redis.mget.mockResolvedValue(Array(24).fill(null))
    expect(await getInstanceQuotaStats()).toMatchObject({ day: { units: 0, calls: 0 }, peakPerSecond: { units: 0, account: null }, rateLimited24h: 0 })
  })

  it('counts each retried rate limit (429 and 403 rateLimitExceeded), not 5xx', async () => {
    vi.useFakeTimers()
    let attempt = 0
    const errors = [
      Object.assign(new Error('429'), { code: 429, response: { headers: { 'retry-after': '0' } } }),
      Object.assign(new Error('403'), { code: 403, errors: [{ reason: 'rateLimitExceeded' }], response: { headers: { 'retry-after': '0' } } }),
      Object.assign(new Error('503'), { code: 503, response: { headers: { 'retry-after': '0' } } }),
    ]
    const run = gmailRetry(async () => {
      if (attempt < errors.length) throw errors[attempt++]
      return 'ok'
    })
    await vi.runAllTimersAsync()
    expect(await run).toBe('ok')
    vi.useRealTimers()
    expect(redis.incr).toHaveBeenCalledTimes(2)
    expect(redis.expire).toHaveBeenCalledWith(expect.stringMatching(/^gmail:rate-limited:\d+$/), 25 * 3600)
  })

  it('a missing Redis never breaks the Gmail call', async () => {
    redisReady = false
    let attempt = 0
    const result = await gmailRetry(async () => {
      if (attempt++ === 0) throw Object.assign(new Error('429'), { code: 429, response: { headers: { 'retry-after': '0' } } })
      return 'ok'
    })
    expect(result).toBe('ok')
    await expect(rateLimitedLast24h()).rejects.toThrow('Redis not initialized')
  })
})

describe('instance archive trash (B15)', () => {
  it('summarises the volume and dates the next purge from the oldest mail', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ count: '3', size: '4096', oldest: new Date('2026-10-01T00:00:00Z') })
      .mockResolvedValueOnce({ value: 7 })
      .mockResolvedValueOnce({ value: true })
    expect(await getArchiveTrashSummary()).toEqual({
      count: 3, sizeBytes: 4096, retentionDays: 7, purgeEnabled: true, nextPurgeAt: '2026-10-08T00:00:00.000Z',
    })
  })

  it('has no next purge when the trash is empty or the purge is off', async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ count: '0', size: null, oldest: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    expect(await getArchiveTrashSummary()).toEqual({ count: 0, sizeBytes: 0, retentionDays: 30, purgeEnabled: true, nextPurgeAt: null })

    mockExecuteTakeFirst
      .mockResolvedValueOnce({ count: '1', size: '1', oldest: new Date() })
      .mockResolvedValueOnce({ value: 30 })
      .mockResolvedValueOnce({ value: false })
    expect((await getArchiveTrashSummary()).nextPurgeAt).toBeNull()
  })

  it('empties every account by batches of 1000 and returns the counts', async () => {
    const batch = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, eml_path: `/a/${prefix}${i}.eml`, size_bytes: '10' }))
    mockExecute.mockImplementation(async () => [])
    mockExecute
      .mockResolvedValueOnce(batch(1000, 'a')) // 1st batch is full: loop again
      .mockResolvedValueOnce([]) // its attachments
      .mockResolvedValueOnce(undefined) // delete attachments
      .mockResolvedValueOnce(undefined) // delete mails
      .mockResolvedValueOnce(batch(2, 'b'))

    expect(await emptyAllArchiveTrash()).toEqual({ deleted: 1002, sizeBytes: 10020 })
    expect(calls.filter((c) => c.method === 'limit')).toEqual([{ method: 'limit', args: [1000] }, { method: 'limit', args: [1000] }])
    expect(mockDeleteFile).toHaveBeenCalledTimes(1002)
  })

  it('empties nothing on an empty trash', async () => {
    mockExecute.mockResolvedValueOnce([])
    expect(await emptyAllArchiveTrash()).toEqual({ deleted: 0, sizeBytes: 0 })
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it('the scheduled purge still honours the disabled flag', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: 30 }).mockResolvedValueOnce({ value: false })
    expect(await purgeArchiveTrash()).toEqual({ deleted: 0 })
  })
})

describe('last integrity check', () => {
  it('stores counts only, and reads them back', async () => {
    await saveIntegrityResult({
      totalRecords: 3, checkedFiles: 3, missingFiles: ['a'], orphanedFiles: ['b', 'c'], corruptedFiles: [], healthy: false,
    })
    const values = calls.find((c) => c.method === 'values')?.args[0] as { key: string; value: string }
    expect(values.key).toBe('integrity_last_check')
    expect(JSON.parse(values.value)).toMatchObject({ checkedFiles: 3, missing: 1, orphaned: 2, corrupted: 0, healthy: false })

    mockExecuteTakeFirst.mockResolvedValueOnce({ value: { healthy: true, checkedFiles: 9 } })
    expect(await getLastIntegrityCheck()).toEqual({ healthy: true, checkedFiles: 9 })
    mockExecuteTakeFirst.mockResolvedValueOnce({ value: '{"healthy":false}' })
    expect(await getLastIntegrityCheck()).toEqual({ healthy: false })
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    expect(await getLastIntegrityCheck()).toBeNull()
  })
})
