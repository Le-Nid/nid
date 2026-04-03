import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateSecret, generateURI, verifySync as otpVerify } from 'otplib'
import QRCode from 'qrcode'
import { getDb } from '../db'
import { logAudit } from '../audit/audit.service'
import { authPresets } from '../utils/auth'

export async function twoFactorRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  // ─── Setup: generate secret + QR code ─────────────────────
  app.post('/setup', auth, async (request) => {
    const userId = request.user.sub

    const user = await db
      .selectFrom('users')
      .select(['email', 'totp_enabled'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()

    if (user.totp_enabled) {
      return { error: '2FA is already enabled' }
    }

    const secret = generateSecret()

    // Store the secret (not yet enabled)
    await db
      .updateTable('users')
      .set({ totp_secret: secret })
      .where('id', '=', userId)
      .execute()

    const otpauth = generateURI({ label: user.email, issuer: 'Nid', secret })
    const qrDataUrl = await QRCode.toDataURL(otpauth)

    return { secret, qrDataUrl }
  })

  // ─── Verify & Enable ─────────────────────────────────────
  app.post('/enable', auth, async (request, reply) => {
    const userId = request.user.sub
    const { token } = z.object({ token: z.string().length(6) }).parse(request.body)

    const user = await db
      .selectFrom('users')
      .select(['totp_secret', 'totp_enabled'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()

    if (user.totp_enabled) {
      return reply.code(400).send({ error: '2FA is already enabled' })
    }
    if (!user.totp_secret) {
      return reply.code(400).send({ error: 'Call /setup first' })
    }

    const result = otpVerify({ token, secret: user.totp_secret })
    if (!result.valid) {
      return reply.code(400).send({ error: 'Invalid TOTP code' })
    }

    await db
      .updateTable('users')
      .set({ totp_enabled: true })
      .where('id', '=', userId)
      .execute()

    await logAudit(userId, 'user.2fa_enable', { ipAddress: request.ip })

    return { success: true }
  })

  // ─── Disable ──────────────────────────────────────────────
  app.post('/disable', auth, async (request, reply) => {
    const userId = request.user.sub
    const { token } = z.object({ token: z.string().length(6) }).parse(request.body)

    const user = await db
      .selectFrom('users')
      .select(['totp_secret', 'totp_enabled'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()

    if (!user.totp_enabled || !user.totp_secret) {
      return reply.code(400).send({ error: '2FA is not enabled' })
    }

    const result = otpVerify({ token, secret: user.totp_secret })
    if (!result.valid) {
      return reply.code(400).send({ error: 'Invalid TOTP code' })
    }

    await db
      .updateTable('users')
      .set({ totp_enabled: false, totp_secret: null })
      .where('id', '=', userId)
      .execute()

    await logAudit(userId, 'user.2fa_disable', { ipAddress: request.ip })

    return { success: true }
  })
}
