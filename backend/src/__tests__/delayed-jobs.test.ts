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
