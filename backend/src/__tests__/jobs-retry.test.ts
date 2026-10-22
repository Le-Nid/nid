import Fastify from 'fastify'

const mockExecuteTakeFirst = vi.fn()
const mockExecute = vi.fn()
const whereCalls: unknown[][] = []
const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'execute') return mockExecute
      return (...args: any[]) => {
        if (prop === 'where') {
          whereCalls.push(args)
          // exercise the id/bullmq_id branch callback like Kysely would
          if (typeof args[0] === 'function') args[0](Object.assign((...a: unknown[]) => a, { or: (x: unknown) => x }))
        }
        return chain
      }
    },
  })
  return chain
}
vi.mock('../db', () => ({ getDb: () => new Proxy({}, { get: () => () => chainable() }) }))

const mockEnqueueJob = vi.fn()
vi.mock('../jobs/queue', () => ({ enqueueJob: (...a: any[]) => mockEnqueueJob(...a), getQueue: vi.fn() }))

import { jobRoutes } from '../routes/jobs'

async function app(userId = 'u1') {
  const a = Fastify({ logger: false })
  a.decorate('authenticate', async (req: any) => { req.user = { sub: userId } })
  await a.register(jobRoutes)
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
})

describe('POST /api/jobs/:jobId/retry (B11)', () => {
  it('404 when the job is unknown or owned by someone else', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    const res = await (await app('intruder')).inject({ method: 'POST', url: '/bulk_operation-abc/retry' })
    expect(res.statusCode).toBe(404)
    expect(whereCalls).toContainEqual(['user_id', '=', 'intruder'])
    expect(mockEnqueueJob).not.toHaveBeenCalled()
  })

  it('re-enqueues the same payload under a new id, linked to the original job', async () => {
    const payload = { accountId: 'acc-1', userId: 'u1', action: 'label', labelId: 'L1', query: 'from:x' }
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: '11111111-1111-1111-1111-111111111111', type: 'bulk_operation', payload })
    mockEnqueueJob.mockResolvedValueOnce({ id: 'bulk_operation-new' })

    const res = await (await app()).inject({ method: 'POST', url: '/11111111-1111-1111-1111-111111111111/retry' })

    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ jobId: 'bulk_operation-new', retryOf: '11111111-1111-1111-1111-111111111111' })
    expect(mockEnqueueJob).toHaveBeenCalledWith('bulk_operation', { ...payload, retryOf: '11111111-1111-1111-1111-111111111111' })
  })

  it('accepts a payload stored as a JSON string', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'row-1', type: 'archive_mails', payload: JSON.stringify({ accountId: 'acc-1', query: 'q' }) })
    mockEnqueueJob.mockResolvedValueOnce({ id: 'archive_mails-new' })
    const res = await (await app()).inject({ method: 'POST', url: '/archive_mails-old/retry' })
    expect(res.statusCode).toBe(202)
    expect(mockEnqueueJob).toHaveBeenCalledWith('archive_mails', { accountId: 'acc-1', query: 'q', userId: 'u1', retryOf: 'row-1' })
  })

  it('409 for jobs whose credentials were redacted from the stored payload', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'row-2', type: 'import_imap', payload: { accountId: 'acc-1', imapConfig: { host: 'h' } } })
    const res = await (await app()).inject({ method: 'POST', url: '/import_imap-old/retry' })
    expect(res.statusCode).toBe(409)
    expect(mockEnqueueJob).not.toHaveBeenCalled()
  })
})

describe('GET /api/jobs (Activité chips, §7.6)', () => {
  it('returns the plain list by default, for the last 30 days only', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'j1' }])
    const res = await (await app()).inject({ method: 'GET', url: '/' })
    expect(res.json()).toEqual([{ id: 'j1' }])
    expect(whereCalls).toContainEqual(['user_id', '=', 'u1'])
    expect(whereCalls.some(([col, op]) => col === 'created_at' && op === '>')).toBe(true)
  })

  it('filters on a comma list of statuses and adds the per-status counts', async () => {
    mockExecute
      .mockResolvedValueOnce([{ id: 'j1', status: 'scheduled' }])
      .mockResolvedValueOnce([{ status: 'scheduled', count: '2' }, { status: 'failed', count: '1' }])
    const res = await (await app()).inject({ method: 'GET', url: '/?status=scheduled,pending&withCounts=true&limit=20' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ jobs: [{ id: 'j1', status: 'scheduled' }], counts: { scheduled: 2, failed: 1 } })
    expect(whereCalls).toContainEqual(['status', 'in', ['scheduled', 'pending']])
  })

  it('rejects an unknown status or a malformed account id', async () => {
    const a = await app()
    for (const url of ['/?status=done', '/?accountId=acc-1', '/?limit=0']) {
      expect((await a.inject({ method: 'GET', url })).statusCode).not.toBe(200)
    }
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
