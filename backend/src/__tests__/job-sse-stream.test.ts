import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import http from 'node:http'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([])
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockExecuteTakeFirstOrThrow
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

vi.mock('bullmq', () => ({
  QueueEvents: class { on = vi.fn() },
  Queue: vi.fn(),
  Worker: vi.fn(),
}))

vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), del: vi.fn() }),
}))

import { jobSseRoutes, broadcastJobUpdate } from '../routes/job-sse'

beforeEach(() => vi.clearAllMocks())

describe('job-sse SSE stream coverage', () => {
  it('SSE stream for active job: stream opens, sends data, broadcastJobUpdate writes, close cleans up', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    app.setErrorHandler(() => {})
    await app.register(jobSseRoutes)

    // Listen on a random port
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const url = new URL(address)

    // Active job
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: 'j-1', bullmq_id: 'job-1', status: 'active', user_id: 'user-1' })
      .mockResolvedValueOnce({ id: 'j-1', status: 'active', progress: 30 })

    const receivedData = await new Promise<string>((resolve) => {
      let data = ''
      const req = http.get(`${address}/job-1/events`, (res) => {
        res.on('data', (chunk) => {
          data += chunk.toString()
          // Once we have the first SSE data event, broadcast an update then close
          if (data.includes('data:')) {
            broadcastJobUpdate('job-1', { type: 'progress', progress: 60 })
            setTimeout(() => {
              req.destroy()
              resolve(data)
            }, 100)
          }
        })
      })
    })

    expect(receivedData).toContain('data:')

    await app.close()
  })

  it('broadcastJobUpdate with no subscribers is a no-op', () => {
    expect(() => broadcastJobUpdate('unknown-job', { type: 'progress', progress: 50 })).not.toThrow()
  })

  it('SSE stream returns 404 when job does not exist', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    app.setErrorHandler(() => {})
    await app.register(jobSseRoutes)

    const address = await app.listen({ port: 0, host: '127.0.0.1' })

    // Job not found
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    const res = await new Promise<http.IncomingMessage>((resolve) => {
      http.get(`${address}/nonexistent/events`, resolve)
    })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('SSE stream for completed job sends final state and closes immediately', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    app.setErrorHandler(() => {})
    await app.register(jobSseRoutes)

    const address = await app.listen({ port: 0, host: '127.0.0.1' })

    // Job already completed
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: 'j-2', bullmq_id: 'job-2', status: 'completed', user_id: 'user-1' })
      .mockResolvedValueOnce({ id: 'j-2', status: 'completed', progress: 100, processed: 50, total: 50 })

    const receivedData = await new Promise<string>((resolve) => {
      let data = ''
      http.get(`${address}/job-2/events`, (res) => {
        res.on('data', (chunk) => { data += chunk.toString() })
        res.on('end', () => resolve(data))
      })
    })

    expect(receivedData).toContain('data:')
    expect(receivedData).toContain('event: close')
    await app.close()
  })

  it('SSE stream uses jobId as key when bullmq_id is null', async () => {
    const app = Fastify({ logger: false })
    app.decorateRequest('jwtVerify', async function (this: any) {
      this.user = { sub: 'user-1' }
    })
    app.decorate('db', mockDb as any)
    app.setErrorHandler(() => {})
    await app.register(jobSseRoutes)

    const address = await app.listen({ port: 0, host: '127.0.0.1' })

    // Job without bullmq_id
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: 'j-3', bullmq_id: null, status: 'active', user_id: 'user-1' })
      .mockResolvedValueOnce({ id: 'j-3', status: 'active', progress: 10 })

    const receivedData = await new Promise<string>((resolve) => {
      let data = ''
      const req = http.get(`${address}/j-3/events`, (res) => {
        res.on('data', (chunk) => {
          data += chunk.toString()
          if (data.includes('data:')) {
            setTimeout(() => { req.destroy(); resolve(data) }, 50)
          }
        })
      })
    })

    expect(receivedData).toContain('data:')
    await app.close()
  })
})
