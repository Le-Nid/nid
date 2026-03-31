import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { verifySync as otpVerify } from 'otplib'
import { getDb } from '../db'
import { getGmailAuthUrl, exchangeGmailCode, getGoogleSsoUrl, exchangeGoogleSsoCode } from '../auth/oauth.service'
import { config } from '../config'
import { logAudit } from '../audit/audit.service'
import { setAuthCookie, clearAuthCookie } from '../plugins'
import { getRedis } from '../plugins/redis'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
})
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  totpCode: z.string().length(6).optional(),
})

export async function authRoutes(app: FastifyInstance) {
  const db = getDb()

  // ─── Public config (registration open?) ───────────────────
  app.get('/config', async () => {
    return {
      allowRegistration: config.ALLOW_REGISTRATION,
      googleSsoEnabled: !!config.GOOGLE_SSO_REDIRECT_URI,
    }
  })

  // ─── Register (Point 5: rate limit) ───────────────────────
  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!config.ALLOW_REGISTRATION) {
      return reply.code(403).send({ error: 'Registration is disabled' })
    }

    const body = registerSchema.parse(request.body)
    const hash = await bcrypt.hash(body.password, 12)

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', body.email)
      .executeTakeFirst()

    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const role = config.ADMIN_EMAIL && body.email === config.ADMIN_EMAIL ? 'admin' : 'user'

    const user = await db
      .insertInto('users')
      .values({ email: body.email, password_hash: hash, role })
      .returning(['id', 'email', 'role'])
      .executeTakeFirstOrThrow()

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    await logAudit(user.id, 'user.register', { ipAddress: request.ip })
    setAuthCookie(reply, token)
    return reply.code(201).send({ user: { id: user.id, email: user.email, role: user.role } })
  })

  // ─── Login (Point 5: rate limit, Point 8: no user enumeration) ──
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'role', 'is_active', 'totp_enabled', 'totp_secret'])
      .where('email', '=', body.email)
      .executeTakeFirst()

    // Point 8: unified error message to prevent user enumeration
    if (!user || !user.is_active || !user.password_hash) {
      // Constant-time hash to prevent timing oracle even when user doesn't exist
      if (!user) await bcrypt.hash(body.password, 12)
      return reply.code(401).send({ error: 'Invalid email or password' })
    }

    const valid = await bcrypt.compare(body.password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid email or password' })

    // 2FA check
    if (user.totp_enabled && user.totp_secret) {
      if (!body.totpCode) {
        return reply.code(403).send({ error: 'TOTP_REQUIRED' })
      }
      const totpResult = otpVerify({ token: body.totpCode, secret: user.totp_secret })
      if (!totpResult.valid) {
        return reply.code(401).send({ error: 'Invalid email or password' })
      }
    }

    await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute()

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    await logAudit(user.id, 'user.login', { ipAddress: request.ip })
    setAuthCookie(reply, token)
    return { user: { id: user.id, email: user.email, role: user.role } }
  })

  // ─── Logout (Point 13: server-side invalidation via Redis blacklist) ──
  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      // Blacklist current JWT until its natural expiration
      if (request.user.exp) {
        const ttl = request.user.exp - Math.floor(Date.now() / 1000)
        if (ttl > 0) {
          const redis = getRedis()
          const raw = request.cookies.token ?? request.headers.authorization?.replace('Bearer ', '')
          if (raw) {
            await redis.set(`jwt:blacklist:${raw}`, '1', 'EX', ttl)
          }
        }
      }
    } catch { /* best-effort */ }
    clearAuthCookie(reply)
    return reply.code(204).send()
  })

  // ─── Refresh (Point 14: token refresh without re-login) ───
  app.post('/refresh', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub: userId, email, role } = request.user
    const token = app.jwt.sign({ sub: userId, email, role })
    setAuthCookie(reply, token)
    return { user: { id: userId, email, role } }
  })

  // ─── Google SSO ───────────────────────────────────────────
  app.get('/google', async () => {
    return { url: getGoogleSsoUrl() }
  })

  // Point 3: use httpOnly cookie + short-lived auth code instead of token in URL
  app.get('/google/callback', async (request, reply) => {
    const { code } = request.query as { code: string }
    try {
      const user = await exchangeGoogleSsoCode(code)
      const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
      await logAudit(user.id, 'user.login_sso', { ipAddress: request.ip })
      // Set httpOnly cookie directly on redirect — no token in URL
      setAuthCookie(reply, token)
      // Pass only a short-lived auth code for user info
      const authCode = crypto.randomBytes(32).toString('hex')
      const redis = getRedis()
      await redis.set(`sso:code:${authCode}`, JSON.stringify({ id: user.id, email: user.email, role: user.role }), 'EX', 60)
      return reply.redirect(`${config.FRONTEND_URL}/login?sso_code=${authCode}`)
    } catch (err: any) {
      app.log.error(err)
      const msg = err.message === 'Account is disabled' ? 'disabled' : 'error'
      return reply.redirect(`${config.FRONTEND_URL}/login?google=${msg}`)
    }
  })

  // Exchange SSO auth code for user info (token is already in cookie)
  app.post('/google/exchange', async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(request.body)
    const redis = getRedis()
    const data = await redis.get(`sso:code:${code}`)
    if (!data) return reply.code(401).send({ error: 'Invalid or expired code' })
    await redis.del(`sso:code:${code}`)
    return JSON.parse(data)
  })

  // ─── Me ───────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'role', 'display_name', 'avatar_url', 'is_active',
               'max_gmail_accounts', 'storage_quota_bytes', 'totp_enabled', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirst()

    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email', 'is_active', 'created_at'])
      .where('user_id', '=', userId)
      .execute()

    // Calculer l'espace utilisé par les archives
    const storageUsed = await db
      .selectFrom('archived_mails')
      .innerJoin('gmail_accounts', 'archived_mails.gmail_account_id', 'gmail_accounts.id')
      .select((eb) => eb.fn.sum<string>('archived_mails.size_bytes').as('total'))
      .where('gmail_accounts.user_id', '=', userId)
      .executeTakeFirst()

    return { user, gmailAccounts: accounts, storageUsedBytes: Number(storageUsed?.total ?? 0) }
  })

  // ─── Gmail OAuth2 (Point 9: signed state) ──────────────────
  app.get('/gmail/connect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub

    // Vérifier le quota de comptes Gmail
    const user = await db
      .selectFrom('users')
      .select('max_gmail_accounts')
      .where('id', '=', userId)
      .executeTakeFirst()

    const { count } = await db
      .selectFrom('gmail_accounts')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow()

    if (Number(count) >= (user?.max_gmail_accounts ?? 3)) {
      return reply.code(403).send({ error: `Maximum ${user?.max_gmail_accounts ?? 3} Gmail accounts allowed` })
    }

    // Sign the state to prevent CSRF
    const state = app.jwt.sign({ userId, purpose: 'gmail_oauth' }, { expiresIn: '5m' })
    return { url: getGmailAuthUrl(state) }
  })

  app.get('/gmail/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string }
    try {
      // Verify signed state
      const decoded = app.jwt.verify(state)
      if ((decoded as any).purpose !== 'gmail_oauth') throw new Error('Invalid state')
      const account = await exchangeGmailCode(code, (decoded as any).userId)
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=connected&account=${account.email}`)
    } catch (err) {
      app.log.error(err)
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=error`)
    }
  })

  app.delete('/gmail/:accountId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const { accountId }      = request.params as { accountId: string }

    await db
      .deleteFrom('gmail_accounts')
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .execute()

    return reply.code(204).send()
  })
}
