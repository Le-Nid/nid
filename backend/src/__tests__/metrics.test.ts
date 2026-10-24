import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

const cfg = vi.hoisted(() => ({ METRICS_TOKEN: 'scrape-secret' }))
vi.mock('../config', () => ({ config: cfg }))
vi.mock('../jobs/queue', () => ({
  getQueue: () => ({ getJobCounts: vi.fn().mockResolvedValue({ waiting: 2, active: 1, delayed: 0, completed: 40, failed: 3 }) }),
}))
const rateLimited = vi.hoisted(() => vi.fn())
vi.mock('../gmail/gmail-throttle', () => ({ rateLimitedLast24h: rateLimited }))

import { registerMetrics } from '../routes/metrics'

async function buildApp() {
  const app = Fastify({ logger: false })
  await registerMetrics(app)
  // Registered as a plugin, like the real routes: the root hook must still time it
  await app.register(async (sub) => { sub.get('/users/:id', async () => ({ ok: true })) }, { prefix: '/api' })
  await app.ready()
  return app
}

beforeEach(() => {
  cfg.METRICS_TOKEN = 'scrape-secret'
  rateLimited.mockResolvedValue(4)
})

describe('GET /api/metrics', () => {
  it('rejects a missing or wrong token', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(401)
    const wrong = await app.inject({ method: 'GET', url: '/api/metrics', headers: { authorization: 'Bearer nope' } })
    expect(wrong.statusCode).toBe(401)
  })

  it('exposes HTTP timings by route pattern, queue counts and Gmail rate limiting', async () => {
    const app = await buildApp()
    await app.inject({ method: 'GET', url: '/api/users/123e4567' })
    const res = await app.inject({ method: 'GET', url: '/api/metrics', headers: { authorization: 'Bearer scrape-secret' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body).toContain('nid_http_request_duration_seconds_count{method="GET",route="/api/users/:id",status_code="200"}')
    expect(res.body).not.toContain('123e4567')
    expect(res.body).toContain('nid_queue_jobs{state="failed"} 3')
    expect(res.body).toContain('nid_gmail_rate_limited_24h 4')
    expect(res.body).toContain('nid_redis_up 1')
    expect(res.body).toContain('nid_process_resident_memory_bytes')
  })

  it('still answers when Redis is down, flagging the Redis-backed values as stale', async () => {
    rateLimited.mockRejectedValue(new Error('ECONNREFUSED'))
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/metrics', headers: { authorization: 'Bearer scrape-secret' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('nid_redis_up 0')
    expect(res.body).toContain('nid_process_resident_memory_bytes')
  })

  it('does not exist without METRICS_TOKEN', async () => {
    cfg.METRICS_TOKEN = ''
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(404)
  })
})
