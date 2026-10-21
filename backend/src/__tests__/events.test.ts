import { EventEmitter } from 'node:events'
import Fastify from 'fastify'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      return (...args: any[]) => {
        // run select((eb) => ...) callbacks so count expressions are built like in Kysely
        if (prop === 'select' && typeof args[0] === 'function') args[0]({ fn: { countAll: () => ({ as: () => 'n' }) } })
        return chain
      }
    },
  })
  return chain
}
vi.mock('../db', () => ({ getDb: () => new Proxy({}, { get: () => () => chainable() }) }))

const sub = Object.assign(new EventEmitter(), {
  subscribe: vi.fn().mockResolvedValue(1),
  unsubscribe: vi.fn().mockResolvedValue(0),
})
const redis = {
  pubsub: vi.fn(),
  publish: vi.fn().mockResolvedValue(1),
  duplicate: vi.fn(() => sub),
}
vi.mock('../plugins/redis', () => ({ getRedis: () => redis }))

const mockGetMailboxProfile = vi.fn()
vi.mock('../gmail/gmail.service', () => ({ getMailboxProfile: (...a: any[]) => mockGetMailboxProfile(...a) }))

import { getCounters, publishUserEvents, subscribeUser, userChannel, sseFrame } from '../events/events.service'
import { eventsRoutes, EVENTS_HEARTBEAT_MS } from '../routes/events'
import { rulesRoutes } from '../routes/rules'

function mockCounters() {
  mockExecute.mockResolvedValueOnce([{ id: 'acc-1' }, { id: 'acc-2' }])
  mockExecuteTakeFirst.mockResolvedValueOnce({ n: '3' }).mockResolvedValueOnce({ n: 1 })
  mockGetMailboxProfile.mockResolvedValueOnce({ messagesTotal: 48212 }).mockRejectedValueOnce(new Error('token revoked'))
}
const COUNTERS = { mails: { 'acc-1': 48212, 'acc-2': null }, activeRules: 3, activeJobs: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockReset()
  mockExecuteTakeFirst.mockReset()
  mockGetMailboxProfile.mockReset()
})

describe('events.service', () => {
  it('getCounters: rules, active jobs and per-account mail totals (null when Gmail fails)', async () => {
    mockCounters()
    expect(await getCounters('u1')).toEqual(COUNTERS)
  })

  it('getCounters: zeros when the counts are missing', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockExecuteTakeFirst.mockResolvedValue(undefined)
    mockGetMailboxProfile.mockResolvedValue({})
    expect(await getCounters('u1')).toEqual({ mails: {}, activeRules: 0, activeJobs: 0 })
  })

  it('publishUserEvents: computes nothing when nobody listens', async () => {
    redis.pubsub.mockResolvedValueOnce([userChannel('u1'), 0])
    await publishUserEvents('u1', { event: 'job', data: {} })
    expect(redis.pubsub).toHaveBeenCalledWith('NUMSUB', 'nid:events:u1')
    expect(redis.publish).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('publishUserEvents: publishes the extra event then fresh counters on the user channel', async () => {
    redis.pubsub.mockResolvedValueOnce([userChannel('u1'), 2])
    mockCounters()
    await publishUserEvents('u1', { event: 'job', data: { jobId: 'j1', phase: 'finished' } })
    expect(redis.publish).toHaveBeenNthCalledWith(1, 'nid:events:u1', sseFrame('job', { jobId: 'j1', phase: 'finished' }))
    expect(redis.publish).toHaveBeenNthCalledWith(2, 'nid:events:u1', sseFrame('counters', COUNTERS))
  })

  it('fans a channel out to its own user only, and leaves the channel with the last listener', async () => {
    const a1 = vi.fn(); const a2 = vi.fn(); const b = vi.fn()
    const offA1 = await subscribeUser('ua', a1)
    const offA2 = await subscribeUser('ua', a2)
    const offB = await subscribeUser('ub', b)
    expect(sub.subscribe).toHaveBeenCalledTimes(2) // once per user, not per connection
    expect(redis.duplicate).toHaveBeenCalledTimes(1)

    sub.emit('message', 'nid:events:ua', 'frame-a')
    expect(a1).toHaveBeenCalledWith('frame-a')
    expect(a2).toHaveBeenCalledWith('frame-a')
    expect(b).not.toHaveBeenCalled()

    await offA1()
    expect(sub.unsubscribe).not.toHaveBeenCalled()
    await offA2()
    expect(sub.unsubscribe).toHaveBeenCalledWith('nid:events:ua')
    sub.emit('message', 'nid:events:ua', 'late')
    expect(a2).toHaveBeenCalledTimes(1)
    await offB()
  })
})

// ─── Route ──────────────────────────────────────────────────
function captureHandler() {
  let handler: any
  const app: any = { authenticate: vi.fn(), get: (_p: string, _o: unknown, h: any) => { handler = h } }
  eventsRoutes(app)
  return handler
}
function fakeReply() {
  const raw = Object.assign(new EventEmitter(), { destroyed: false, writeHead: vi.fn(), write: vi.fn() })
  return { raw }
}
const tick = () => new Promise((r) => setImmediate(r))

describe('GET /api/events', () => {
  it('401 without a valid session', async () => {
    const app = Fastify({ logger: false })
    app.decorate('authenticate', async (_req: any, reply: any) => reply.code(401).send({ error: 'Unauthorized' }))
    await app.register(eventsRoutes, { prefix: '/api/events' })
    const res = await app.inject({ method: 'GET', url: '/api/events' })
    expect(res.statusCode).toBe(401)
    expect(sub.subscribe).not.toHaveBeenCalled()
    await app.close()
  })

  it('sends counters on connect, forwards published frames, heartbeats every 30 s and unsubscribes on close', async () => {
    vi.useFakeTimers()
    try {
      const handler = captureHandler()
      const reply = fakeReply()
      mockCounters()
      await handler({ user: { sub: 'u-route' }, log: { warn: vi.fn() } }, reply)

      expect(reply.raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }))
      expect(sub.subscribe).toHaveBeenCalledWith('nid:events:u-route')
      expect(reply.raw.write).toHaveBeenLastCalledWith(sseFrame('counters', COUNTERS))

      sub.emit('message', 'nid:events:u-route', 'event: job\ndata: {}\n\n')
      expect(reply.raw.write).toHaveBeenLastCalledWith('event: job\ndata: {}\n\n')

      vi.advanceTimersByTime(EVENTS_HEARTBEAT_MS)
      expect(reply.raw.write).toHaveBeenLastCalledWith(': heartbeat\n\n')

      reply.raw.emit('close')
      await vi.runAllTimersAsync()
      expect(sub.unsubscribe).toHaveBeenCalledWith('nid:events:u-route')
      const writes = reply.raw.write.mock.calls.length
      vi.advanceTimersByTime(EVENTS_HEARTBEAT_MS * 2)
      expect(reply.raw.write).toHaveBeenCalledTimes(writes) // heartbeat cleared
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write to a destroyed socket and logs a failed unsubscribe', async () => {
    const handler = captureHandler()
    const reply = fakeReply()
    const warn = vi.fn()
    mockCounters()
    await handler({ user: { sub: 'u-gone' }, log: { warn } }, reply)
    reply.raw.destroyed = true
    sub.emit('message', 'nid:events:u-gone', 'x')
    expect(reply.raw.write).not.toHaveBeenCalledWith('x')
    sub.unsubscribe.mockRejectedValueOnce(new Error('redis down'))
    reply.raw.emit('close')
    await tick()
    expect(warn).toHaveBeenCalled()
  })
})

describe('rules routes publish counters after a change (B3)', () => {
  async function rulesApp() {
    const app = Fastify({ logger: false })
    app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u-rules' } })
    app.decorate('requireAccountOwnership', async () => {})
    await app.register(rulesRoutes)
    return app
  }

  it('publishes on a successful write, not on reads', async () => {
    const app = await rulesApp()
    redis.pubsub.mockResolvedValue(['c', 0])
    await app.inject({ method: 'GET', url: '/templates' })
    expect(redis.pubsub).not.toHaveBeenCalled()
    mockExecuteTakeFirst.mockResolvedValue(undefined)
    await app.inject({ method: 'DELETE', url: '/acc-1/rule-1' })
    await tick()
    expect(redis.pubsub).toHaveBeenCalledWith('NUMSUB', 'nid:events:u-rules')
    await app.close()
  })

  it('swallows publish errors', async () => {
    const app = await rulesApp()
    redis.pubsub.mockRejectedValueOnce(new Error('redis down'))
    const res = await app.inject({ method: 'DELETE', url: '/acc-1/rule-1' })
    await tick()
    expect(res.statusCode).toBe(204)
    await app.close()
  })
})
