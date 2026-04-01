import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    leftJoin: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    doNothing: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
    updateTable: () => chainable(),
    deleteFrom: () => chainable(),
  }),
}))

const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() }
vi.mock('../plugins/redis', () => ({ getRedis: () => mockRedis }))

// ─── queue.ts ──────────────────────────────────────────────
describe('enqueueJob', () => {
  it('queue module exports JobType types', async () => {
    // Just verify the module can be imported and has the right shape
    const { enqueueJob } = await import('../jobs/queue')
    expect(enqueueJob).toBeDefined()
  })
})

// ─── plugins/index.ts — setAuthCookie / clearAuthCookie ────
describe('setAuthCookie and clearAuthCookie', () => {
  // Import doesn't require full Fastify setup
  it('sets cookie with correct options', async () => {
    const { setAuthCookie, clearAuthCookie } = await import('../plugins/index')

    const reply = {
      setCookie: vi.fn(),
      clearCookie: vi.fn(),
    }

    setAuthCookie(reply, 'test-token')
    expect(reply.setCookie).toHaveBeenCalledWith(
      'token',
      'test-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    )
  })

  it('clears cookie', async () => {
    const { clearAuthCookie } = await import('../plugins/index')

    const reply = { clearCookie: vi.fn() }
    clearAuthCookie(reply)
    expect(reply.clearCookie).toHaveBeenCalledWith('token', { path: '/' })
  })
})

// ─── utils/auth.ts ─────────────────────────────────────────
describe('authPresets', () => {
  it('returns preHandler configurations', async () => {
    const { authPresets } = await import('../utils/auth')

    const mockApp = {
      authenticate: vi.fn(),
      requireAccountOwnership: vi.fn(),
      requireAdmin: vi.fn(),
    } as any

    const presets = authPresets(mockApp)
    expect(presets.auth.preHandler).toEqual([mockApp.authenticate])
    expect(presets.accountAuth.preHandler).toEqual([mockApp.authenticate, mockApp.requireAccountOwnership])
    expect(presets.adminAuth.preHandler).toEqual([mockApp.authenticate, mockApp.requireAdmin])
  })
})
