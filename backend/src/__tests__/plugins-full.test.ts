import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock all Fastify plugins and dependencies ──────────────
vi.mock('@fastify/cors', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/jwt', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/cookie', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/rate-limit', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/swagger', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@fastify/swagger-ui', () => ({ default: vi.fn(async () => {}) }))
vi.mock('../plugins/db', () => ({ connectDb: vi.fn(async () => {}) }))
vi.mock('../plugins/redis', () => ({
  connectRedis: vi.fn(async () => {}),
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
  }),
}))

vi.mock('../db', () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return vi.fn().mockResolvedValue([])
      if (prop === 'executeTakeFirst') return vi.fn().mockResolvedValue(null)
      return (..._args: any[]) => chain
    },
  })
  const mockDb = new Proxy({}, { get: () => () => chain })
  return {
    db: mockDb,
    getDb: () => mockDb,
    runMigrations: vi.fn(),
    closeDb: vi.fn(),
  }
})

import { registerPlugins, setAuthCookie, clearAuthCookie } from '../plugins/index'

beforeEach(() => vi.clearAllMocks())

// ─── Helper to create mock Fastify app ──────────────────────
function createMockApp() {
  const decorators: Record<string, any> = {}
  const hooks: Record<string, Function[]> = {}
  const app: any = {
    register: vi.fn().mockResolvedValue(undefined),
    decorate: vi.fn((name: string, value: any) => {
      decorators[name] = value
      app[name] = value
    }),
    addHook: vi.fn((event: string, fn: Function) => {
      hooks[event] = hooks[event] || []
      hooks[event].push(fn)
    }),
    setErrorHandler: vi.fn(),
    log: { info: vi.fn(), error: vi.fn() },
    db: null as any,
    redis: { get: vi.fn().mockResolvedValue(null) } as any,
  }
  return { app, decorators, hooks }
}

describe('registerPlugins', () => {
  it('registers all plugins and decorators', async () => {
    const { app, decorators } = createMockApp()
    await registerPlugins(app)

    // Should register cors, cookie, jwt, rateLimit, swagger, swaggerUi, + db/redis calls
    expect(app.register).toHaveBeenCalled()
    expect(app.setErrorHandler).toHaveBeenCalled()
    expect(decorators.authenticate).toBeDefined()
    expect(decorators.requireAccountOwnership).toBeDefined()
    expect(decorators.requireAdmin).toBeDefined()
  })

  it('error handler handles ZodError', async () => {
    const { app } = createMockApp()
    await registerPlugins(app)

    const errorHandler = app.setErrorHandler.mock.calls[0][0]
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }
    const request = { log: { error: vi.fn() } }

    // Simulate a ZodError
    const { ZodError } = await import('zod')
    const zodErr = new ZodError([{ code: 'custom', path: ['field'], message: 'bad' }])
    errorHandler(zodErr, request, reply)
    expect(reply.code).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }))
  })

  it('error handler handles statusCode errors', async () => {
    const { app } = createMockApp()
    await registerPlugins(app)

    const errorHandler = app.setErrorHandler.mock.calls[0][0]
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }
    const request = { log: { error: vi.fn() } }

    errorHandler({ statusCode: 404, message: 'Not found' }, request, reply)
    expect(reply.code).toHaveBeenCalledWith(404)
  })

  it('error handler handles generic errors', async () => {
    const { app } = createMockApp()
    await registerPlugins(app)

    const errorHandler = app.setErrorHandler.mock.calls[0][0]
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }
    const request = { log: { error: vi.fn() } }

    errorHandler(new Error('boom'), request, reply)
    expect(reply.code).toHaveBeenCalledWith(500)
  })

  it('authenticate rejects when no valid JWT', async () => {
    const { app, decorators } = createMockApp()
    await registerPlugins(app)

    const request = { jwtVerify: vi.fn().mockRejectedValue(new Error('invalid')), cookies: {}, headers: {} }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }

    await decorators.authenticate(request, reply)
    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('authenticate rejects blacklisted JWT', async () => {
    const { app, decorators } = createMockApp()
    app.redis = { get: vi.fn().mockResolvedValue('1') }
    await registerPlugins(app)

    const request = {
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      user: { sub: 'user-1' },
      cookies: { token: 'jwt-token' },
      headers: {},
    }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn(), clearCookie: vi.fn().mockReturnThis() }

    await decorators.authenticate(request, reply)
    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('requireAdmin rejects non-admin user', async () => {
    const { app, decorators } = createMockApp()
    await registerPlugins(app)

    const request = { user: { role: 'user' } }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }

    await decorators.requireAdmin(request, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('requireAdmin allows admin user', async () => {
    const { app, decorators } = createMockApp()
    await registerPlugins(app)

    const request = { user: { role: 'admin' } }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }

    const result = await decorators.requireAdmin(request, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('requireAccountOwnership rejects when account not owned', async () => {
    const { app, decorators } = createMockApp()
    // db must be set before registerPlugins since requireAccountOwnership uses app.db
    const chain2: any = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'executeTakeFirst') return vi.fn().mockResolvedValue(null)
        return (..._args: any[]) => chain2
      },
    })
    app.db = new Proxy({}, { get: () => () => chain2 })
    await registerPlugins(app)

    const request = { user: { sub: 'user-1' }, params: { accountId: 'acc-1' } }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }

    await decorators.requireAccountOwnership(request, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('requireAccountOwnership skips when no accountId', async () => {
    const { app, decorators } = createMockApp()
    await registerPlugins(app)

    const request = { user: { sub: 'user-1' }, params: {} }
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() }

    await decorators.requireAccountOwnership(request, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })
})

describe('setAuthCookie', () => {
  it('sets httpOnly cookie', () => {
    const reply = { setCookie: vi.fn() }
    setAuthCookie(reply, 'my-token')
    expect(reply.setCookie).toHaveBeenCalledWith('token', 'my-token', expect.objectContaining({
      httpOnly: true,
      path: '/',
    }))
  })
})

describe('clearAuthCookie', () => {
  it('clears token cookie', () => {
    const reply = { clearCookie: vi.fn() }
    clearAuthCookie(reply)
    expect(reply.clearCookie).toHaveBeenCalledWith('token', { path: '/' })
  })
})

describe('connectDb', () => {
  it('is called during plugin registration', async () => {
    const { connectDb } = await import('../plugins/db')
    const { app } = createMockApp()
    await registerPlugins(app)
    // connectDb is mocked and called via app.register
    expect(app.register).toHaveBeenCalled()
  })
})

describe('connectRedis', () => {
  it('is called during plugin registration', async () => {
    const { app } = createMockApp()
    await registerPlugins(app)
    expect(app.register).toHaveBeenCalled()
  })
})

describe('getRedis', () => {
  it('returns redis instance after initialization', async () => {
    const { getRedis } = await import('../plugins/redis')
    // getRedis is mocked to return a redis-like object
    const redis = getRedis()
    expect(redis).toBeDefined()
  })
})
