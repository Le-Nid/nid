import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock db module ─────────────────────────────────────────
const mockDbExecute = vi.fn()
const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockDbExecute
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDbInstance = new Proxy({}, { get: () => () => chainable() })
const mockRunMigrations = vi.fn()
const mockCloseDb = vi.fn()

vi.mock('../db', () => ({
  db: mockDbInstance,
  runMigrations: (...args: any[]) => mockRunMigrations(...args),
  closeDb: (...args: any[]) => mockCloseDb(...args),
}))

// ─── Mock ioredis ───────────────────────────────────────────
const mockRedisConnect = vi.fn()
const mockRedisPing = vi.fn()
const mockRedisQuit = vi.fn()

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    connect = mockRedisConnect
    ping = mockRedisPing
    quit = mockRedisQuit
    constructor(_url: string, _opts: any) {}
  },
}))

vi.mock('../config', () => ({
  config: {
    REDIS_URL: 'redis://localhost:6379',
  },
}))

beforeEach(() => vi.clearAllMocks())

describe('connectDb plugin', () => {
  it('runs migrations, tests connection, and decorates app', async () => {
    const { connectDb } = await import('../plugins/db')

    mockRunMigrations.mockResolvedValueOnce(undefined)
    mockDbExecute.mockResolvedValueOnce([]) // SELECT test

    const hooks: any[] = []
    const mockApp: any = {
      log: { info: vi.fn() },
      decorate: vi.fn(),
      addHook: vi.fn().mockImplementation((_name: string, fn: any) => hooks.push(fn)),
    }

    await connectDb(mockApp)

    expect(mockRunMigrations).toHaveBeenCalled()
    expect(mockDbExecute).toHaveBeenCalled()
    expect(mockApp.decorate).toHaveBeenCalledWith('db', expect.anything())
    expect(mockApp.addHook).toHaveBeenCalledWith('onClose', expect.any(Function))

    // Test onClose hook
    await hooks[0]()
    expect(mockCloseDb).toHaveBeenCalled()
  })
})

describe('connectRedis plugin', () => {
  it('connects, pings, decorates app, and closes on shutdown', async () => {
    // Need fresh import since the module has state (_redis)
    vi.resetModules()
    vi.doMock('../db', () => ({
      db: mockDbInstance,
      runMigrations: mockRunMigrations,
      closeDb: mockCloseDb,
    }))
    vi.doMock('ioredis', () => ({
      Redis: class {
        connect = mockRedisConnect
        ping = mockRedisPing
        quit = mockRedisQuit
        constructor() {}
      },
    }))
    vi.doMock('../config', () => ({
      config: { REDIS_URL: 'redis://localhost:6379' },
    }))

    const { connectRedis, getRedis } = await import('../plugins/redis')

    mockRedisConnect.mockResolvedValueOnce(undefined)
    mockRedisPing.mockResolvedValueOnce('PONG')

    const hooks: any[] = []
    const mockApp: any = {
      log: { info: vi.fn() },
      decorate: vi.fn(),
      addHook: vi.fn().mockImplementation((_name: string, fn: any) => hooks.push(fn)),
    }

    await connectRedis(mockApp)

    expect(mockRedisConnect).toHaveBeenCalled()
    expect(mockRedisPing).toHaveBeenCalled()
    expect(mockApp.decorate).toHaveBeenCalledWith('redis', expect.anything())

    // getRedis should return the instance now
    const redis = getRedis()
    expect(redis).toBeDefined()

    // Test onClose hook
    await hooks[0]()
    expect(mockRedisQuit).toHaveBeenCalled()
  })
})

describe('getRedis', () => {
  it('throws when not initialized', async () => {
    vi.resetModules()
    vi.doMock('../config', () => ({
      config: { REDIS_URL: 'redis://localhost:6379' },
    }))
    vi.doMock('ioredis', () => ({
      Redis: class {
        connect = vi.fn()
        ping = vi.fn()
        quit = vi.fn()
      },
    }))

    const { getRedis } = await import('../plugins/redis')
    expect(() => getRedis()).toThrow('Redis not initialized')
  })
})
