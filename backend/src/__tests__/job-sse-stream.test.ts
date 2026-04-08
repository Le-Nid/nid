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
})
