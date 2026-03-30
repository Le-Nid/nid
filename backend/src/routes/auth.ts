import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { authenticator } from 'otplib'
import { getDb } from '../db'
import { getGmailAuthUrl, exchangeGmailCode, getGoogleSsoUrl, exchangeGoogleSsoCode } from '../auth/oauth.service'
import { config } from '../config'
import { logAudit } from '../audit/audit.service'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
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

  // ─── Register ─────────────────────────────────────────────
  app.post('/register', async (request, reply) => {
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
    return reply.code(201).send({ token, user: { id: user.id, email: user.email, role: user.role } })
  })

  // ─── Login ────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'role', 'is_active', 'totp_enabled', 'totp_secret'])
      .where('email', '=', body.email)
      .executeTakeFirst()

    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })
    if (!user.is_active) return reply.code(403).send({ error: 'Account is disabled' })
    if (!user.password_hash) return reply.code(401).send({ error: 'This account uses Google Sign-In' })

    const valid = await bcrypt.compare(body.password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    // 2FA check
    if (user.totp_enabled && user.totp_secret) {
      if (!body.totpCode) {
        return reply.code(403).send({ error: 'TOTP_REQUIRED' })
      }
      const totpValid = authenticator.verify({ token: body.totpCode, secret: user.totp_secret })
      if (!totpValid) {
        return reply.code(401).send({ error: 'Invalid TOTP code' })
      }
    }

    await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', user.id).execute()

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    await logAudit(user.id, 'user.login', { ipAddress: request.ip })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })

  // ─── Google SSO ───────────────────────────────────────────
  app.get('/google', async () => {
    return { url: getGoogleSsoUrl() }
  })

  app.get('/google/callback', async (request, reply) => {
    const { code } = request.query as { code: string }
    try {
      const user = await exchangeGoogleSsoCode(code)
      const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
      await logAudit(user.id, 'user.login_sso', { ipAddress: request.ip })
      return reply.redirect(`${config.FRONTEND_URL}/login?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, role: user.role }))}`)
    } catch (err: any) {
      app.log.error(err)
      const msg = err.message === 'Account is disabled' ? 'disabled' : 'error'
      return reply.redirect(`${config.FRONTEND_URL}/login?google=${msg}`)
    }
  })

  // ─── Me ───────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string }

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

  // ─── Gmail OAuth2 ──────────────────────────────────────────
  app.get('/gmail/connect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }

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

    return { url: getGmailAuthUrl(userId) }
  })

  app.get('/gmail/callback', async (request, reply) => {
    const { code, state: userId } = request.query as { code: string; state: string }
    try {
      const account = await exchangeGmailCode(code, userId)
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=connected&account=${account.email}`)
    } catch (err) {
      app.log.error(err)
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=error`)
    }
  })

  app.delete('/gmail/:accountId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub: userId }    = request.user as { sub: string }
    const { accountId }      = request.params as { accountId: string }

    await db
      .deleteFrom('gmail_accounts')
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .execute()

    return reply.code(204).send()
  })
}
