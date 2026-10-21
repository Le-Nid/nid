import Fastify from 'fastify'
import { ZodError } from 'zod'

// D1 (design/ui-redesign.md, B1): bulk actions are delayed BullMQ jobs that DELETE /api/jobs/:id can cancel.

const { mockEnqueueJob, mockGetJob, jobRows, wheres, updates } = vi.hoisted(() => ({
  mockEnqueueJob: vi.fn(),
  mockGetJob: vi.fn(),
  jobRows: [] as Array<{ id: string; bullmq_id: string; user_id: string }>,
  wheres: [] as unknown[][],
  updates: [] as unknown[],
}))

vi.mock('../jobs/queue', () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
  getQueue: () => ({ getJob: mockGetJob }),
}))

// Minimal Kysely stand-in for the jobs table: filters rows on user_id and on the id/bullmq_id expression.
vi.mock('../db', () => {
  const chain = (): any => {
    const c: any = {
      select: () => c, set: (v: unknown) => { updates.push(v); return c },
      where: (...args: unknown[]) => {
        wheres.push(args)
        if (typeof args[0] === 'function') {
          const eb: any = (col: string, _op: string, val: string) => (r: any) => r[col] === val
          eb.or = (fns: Array<(r: any) => boolean>) => (r: any) => fns.some((f) => f(r))
          const pred = args[0](eb)
          c.filters.push(pred)
        } else {
          const [col, , val] = args as [string, string, string]
          c.filters.push((r: any) => r[col] === val)
        }
        return c
      },
      filters: [] as Array<(r: any) => boolean>,
      executeTakeFirst: async () => jobRows.find((r) => c.filters.every((f: any) => f(r))),
      execute: async () => [],
    }
    return c
  }
  return { getDb: () => ({ selectFrom: chain, updateTable: chain }) }
})

vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('../gmail/quota.service', () => ({ trackApiCall: vi.fn() }))
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: vi.fn(),
  getNewsletterMessageIds: vi.fn().mockResolvedValue(['m1', 'm2']),
}))
vi.mock('../rules/rules.service', () => ({
  getRules: vi.fn(), getRule: vi.fn().mockResolvedValue({ id: 'r1' }), createRule: vi.fn(),
  updateRule: vi.fn(), deleteRule: vi.fn(), runRule: vi.fn(), buildGmailQuery: vi.fn(),
}))

import { gmailRoutes } from '../routes/gmail'
import { logAudit } from '../audit/audit.service'
import { unsubscribeRoutes } from '../routes/unsubscribe'
import { rulesRoutes } from '../routes/rules'
import { jobRoutes } from '../routes/jobs'

async function buildApp(routes: (app: any) => Promise<void>) {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => { request.user = { sub: 'user-1' } })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  // same mapping as the global handler in plugins/index.ts
  app.setErrorHandler((err: any, _req, reply) => reply.code(err instanceof ZodError ? 400 : 500).send({ error: String(err) }))
  await app.register(routes)
  await app.ready()
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  jobRows.length = 0
  wheres.length = 0
  updates.length = 0
  mockEnqueueJob.mockResolvedValue({ id: 'bulk_operation-abc' })
})

describe('delayMs on bulk endpoints', () => {
  it.each([
    ['bulk', gmailRoutes, '/acc-1/messages/bulk', { action: 'trash', messageIds: ['m1'] }],
    ['sender delete', unsubscribeRoutes, '/acc-1/newsletters/a%40b.com/delete', {}],
    ['rule run', rulesRoutes, '/acc-1/r1/run', undefined],
  ])('%s defaults to a 10 s delay and returns jobId + runAt', async (_name, routes, url, payload) => {
    const app = await buildApp(routes)
    const before = Date.now()
    const res = await app.inject({ method: 'POST', url, payload })
    expect(res.statusCode).toBe(202)
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.any(String), expect.any(Object), { delay: 10_000 })
    const body = res.json()
    expect(body.jobId).toBe('bulk_operation-abc')
    expect(Date.parse(body.runAt) - before).toBeGreaterThanOrEqual(10_000)
    await app.close()
  })

  it('accepts delayMs 0 (run now) and 60000, rejects out of range or non-integer', async () => {
    const app = await buildApp(gmailRoutes)
    const post = (delayMs: unknown) => app.inject({
      method: 'POST', url: '/acc-1/messages/bulk', payload: { action: 'trash', messageIds: ['m1'], delayMs },
    })
    expect((await post(0)).statusCode).toBe(202)
    expect(mockEnqueueJob).toHaveBeenLastCalledWith('bulk_operation', expect.any(Object), { delay: 0 })
    expect((await post(60_000)).statusCode).toBe(202)
    expect((await post(60_001)).statusCode).toBe(400)
    expect((await post(-1)).statusCode).toBe(400)
    expect((await post(1.5)).statusCode).toBe(400)
    await app.close()
  })
})

describe('bulk select-all by query (B5)', () => {
  const post = async (payload: Record<string, unknown>) => {
    const app = await buildApp(gmailRoutes)
    const res = await app.inject({ method: 'POST', url: '/acc-1/messages/bulk', payload: { action: 'trash', ...payload } })
    await app.close()
    return res
  }

  it.each([
    ['both', { messageIds: ['m1'], query: 'from:a' }],
    ['none', {}],
    ['empty query', { query: '  ' }],
  ])('rejects %s messageIds/query with 400', async (_name, payload) => {
    expect((await post(payload)).statusCode).toBe(400)
    expect(mockEnqueueJob).not.toHaveBeenCalled()
  })

  it('enqueues the query (no ids) with the default delay and leaves the audit to the worker', async () => {
    const res = await post({ query: 'from:news@x.com' })
    expect(res.statusCode).toBe(202)
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      'bulk_operation',
      expect.objectContaining({ accountId: 'acc-1', userId: 'user-1', action: 'trash', query: 'from:news@x.com', messageIds: undefined }),
      { delay: 10_000 },
    )
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('still audits at enqueue time for explicit ids', async () => {
    await post({ messageIds: ['m1', 'm2'] })
    expect(logAudit).toHaveBeenCalledWith('user-1', 'bulk.trash', expect.objectContaining({
      details: expect.objectContaining({ count: 2 }),
    }))
  })
})

describe('DELETE /api/jobs/:jobId', () => {
  const ROW_ID = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    jobRows.push({ id: ROW_ID, bullmq_id: 'bulk_operation-abc', user_id: 'user-1' })
  })

  it('removes a delayed job from BullMQ and marks the row cancelled (by BullMQ id or row id)', async () => {
    const app = await buildApp(jobRoutes)
    for (const id of ['bulk_operation-abc', ROW_ID]) {
      const bullJob = { remove: vi.fn(), getState: vi.fn().mockResolvedValue('delayed') }
      mockGetJob.mockResolvedValueOnce(bullJob)
      const res = await app.inject({ method: 'DELETE', url: `/${id}` })
      expect(res.statusCode).toBe(204)
      expect(bullJob.remove).toHaveBeenCalled()
    }
    expect(updates).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }])
    await app.close()
  })

  it('returns 409, not 500, when the job is already active (locked)', async () => {
    const app = await buildApp(jobRoutes)
    mockGetJob.mockResolvedValueOnce({
      remove: vi.fn().mockRejectedValue(new Error('Job bulk_operation-abc could not be removed because it is locked by another worker')),
      getState: vi.fn().mockResolvedValue('active'),
    })
    const res = await app.inject({ method: 'DELETE', url: '/bulk_operation-abc' })
    expect(res.statusCode).toBe(409)
    expect(updates).toEqual([])
    await app.close()
  })

  it("returns 404 for another user's job and leaves it alone", async () => {
    jobRows[0].user_id = 'user-2'
    const app = await buildApp(jobRoutes)
    const res = await app.inject({ method: 'DELETE', url: '/bulk_operation-abc' })
    expect(res.statusCode).toBe(404)
    expect(mockGetJob).not.toHaveBeenCalled()
    expect(wheres).toContainEqual(['user_id', '=', 'user-1'])
    await app.close()
  })
})
