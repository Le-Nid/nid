import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
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
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))
vi.mock('otplib', () => ({
  generateSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  generateURI: vi.fn().mockReturnValue('otpauth://totp/Gmail%20Manager:user@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Gmail%20Manager'),
  verifySync: vi.fn().mockReturnValue({ valid: true }),
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}))

import { twoFactorRoutes } from '../routes/2fa'
import { verifySync } from 'otplib'

beforeEach(() => vi.clearAllMocks())

async function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-1' }
  })
  app.decorate('requireAccountOwnership', async () => {})
  app.decorate('requireAdmin', async () => {})
  await app.register(twoFactorRoutes)
  await app.ready()
  return app
}

describe('2FA routes', () => {
  describe('POST /setup', () => {
    it('returns secret and QR code', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ email: 'user@test.com', totp_enabled: false })
      mockExecute.mockResolvedValue([])

      const res = await app.inject({ method: 'POST', url: '/setup' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.secret).toBe('JBSWY3DPEHPK3PXP')
      expect(body.qrDataUrl).toBe('data:image/png;base64,QR')
      await app.close()
    })

    it('returns error if 2FA already enabled', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ email: 'user@test.com', totp_enabled: true })

      const res = await app.inject({ method: 'POST', url: '/setup' })
      expect(res.statusCode).toBe(200)
      expect(res.json().error).toBeDefined()
      await app.close()
    })
  })

  describe('POST /enable', () => {
    it('enables 2FA with valid TOTP code', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: 'SECRET', totp_enabled: false })
      mockExecute.mockResolvedValue([])

      const res = await app.inject({ method: 'POST', url: '/enable', payload: { token: '123456' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      await app.close()
    })

    it('returns 400 if already enabled', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: 'SECRET', totp_enabled: true })

      const res = await app.inject({ method: 'POST', url: '/enable', payload: { token: '123456' } })
      expect(res.statusCode).toBe(400)
      await app.close()
    })

    it('returns 400 if no secret setup', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: null, totp_enabled: false })

      const res = await app.inject({ method: 'POST', url: '/enable', payload: { token: '123456' } })
      expect(res.statusCode).toBe(400)
      await app.close()
    })

    it('returns 400 for invalid TOTP code', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: 'SECRET', totp_enabled: false })
      ;(verifySync as any).mockReturnValueOnce({ valid: false })

      const res = await app.inject({ method: 'POST', url: '/enable', payload: { token: '000000' } })
      expect(res.statusCode).toBe(400)
      await app.close()
    })
  })

  describe('POST /disable', () => {
    it('disables 2FA with valid TOTP', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: 'SECRET', totp_enabled: true })
      mockExecute.mockResolvedValue([])

      const res = await app.inject({ method: 'POST', url: '/disable', payload: { token: '123456' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      await app.close()
    })

    it('returns 400 if 2FA not enabled', async () => {
      const app = await buildApp()
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ totp_secret: null, totp_enabled: false })

      const res = await app.inject({ method: 'POST', url: '/disable', payload: { token: '123456' } })
      expect(res.statusCode).toBe(400)
      await app.close()
    })
  })
})
