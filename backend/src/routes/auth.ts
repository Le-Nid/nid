import { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { verifySync as otpVerify } from 'otplib'
import { getDb } from '../db'
import { getGmailAuthUrl, exchangeGmailCode } from '../auth/oauth.service'
import { syncLabels } from '../labels/labels.service'
import { getEnabledProviders, isProviderEnabled, createAuthorizationUrl, exchangeSocialCode } from '../auth/social.service'
import { config } from '../config'
import { logAudit, type AuditAction } from '../audit/audit.service'
import { setAuthCookie, clearAuthCookie } from '../plugins'
import { getRedis } from '../plugins/redis'
import { deleteUser, exportUserData } from '../account/account.service'
import { isMailEnabled, sendMail } from '../mail/mail.service'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
})
// B12: automatic NAS backup of one Gmail account
const accountSettingsSchema = z.object({
  backup_enabled:  z.boolean().optional(),
  backup_interval: z.enum(['1h', '6h', '24h']).optional(),
}).strict().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' })

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  totpCode: z.string().length(6).optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword:     z.string().min(8).max(128),
})

const forgotPasswordSchema = z.object({ email: z.string().email() })
const resetPasswordSchema = z.object({
  token:       z.string().regex(/^[0-9a-f]{64}$/),
  newPassword: z.string().min(8).max(128),
})
const RESET_TTL_SECONDS = 3600

/** Reset link waiting in Redis under the token's SHA-256 (a Redis dump never holds a usable token). */
interface PendingReset { userId: string; issuedAt: number }
const resetKey = (token: string) => `pwreset:${crypto.createHash('sha256').update(token).digest('hex')}`

// Local accounts confirm with their password, SSO-only accounts (no password) by typing their e-mail
const deleteAccountSchema = z.object({
  password: z.string().max(128).optional(),
  email:    z.string().max(255).optional(),
})

const ssoExchangeSchema = z.object({
  code:     z.string().min(1),
  totpCode: z.string().length(6).optional(),
})

const SSO_CODE_TTL_SECONDS = 60
const SSO_TOTP_TTL_SECONDS = 300
const SSO_TOTP_MAX_ATTEMPTS = 5

/** SSO login waiting in Redis for `/google/exchange` (and its TOTP code when 2FA is on). */
interface PendingSsoLogin {
  id: string
  email: string
  role: string
  totpRequired?: boolean
  auditAction: AuditAction
  auditDetails?: Record<string, unknown>
}

export async function authRoutes(app: FastifyInstance) {
  const db = getDb()

  /**
   * End of an SSO / social callback: returns the one-time code passed to the frontend.
   * Without 2FA the session cookie is set right away; with 2FA it is set by `/google/exchange`
   * once the TOTP code is checked, so SSO cannot bypass the second factor.
   */
  async function issueSsoCode(
    user: { id: string; email: string; role: string },
    reply: FastifyReply,
    ipAddress: string,
    auditAction: AuditAction,
    auditDetails?: Record<string, unknown>,
  ): Promise<string> {
    const totp = await db
      .selectFrom('users')
      .select(['totp_enabled', 'totp_secret'])
      .where('id', '=', user.id)
      .executeTakeFirst()
    const totpRequired = !!totp?.totp_enabled && !!totp.totp_secret

    const pending: PendingSsoLogin = { id: user.id, email: user.email, role: user.role, auditAction, auditDetails }
    if (totpRequired) {
      pending.totpRequired = true
    } else {
      setAuthCookie(reply, app.jwt.sign({ sub: user.id, email: user.email, role: user.role }))
      await logAudit(user.id, auditAction, { details: auditDetails, ipAddress })
    }

    const authCode = crypto.randomBytes(32).toString('hex')
    const ttl = totpRequired ? SSO_TOTP_TTL_SECONDS : SSO_CODE_TTL_SECONDS
    await getRedis().set(`sso:code:${authCode}`, JSON.stringify(pending), 'EX', ttl)
    return authCode
  }

  // ─── Public config (registration open?) ───────────────────
  app.get('/config', async () => {
    return {
      allowRegistration: config.ALLOW_REGISTRATION,
      googleSsoEnabled: !!config.GOOGLE_SSO_REDIRECT_URI,
      passwordResetEnabled: isMailEnabled(),
      socialProviders: getEnabledProviders(),
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

  // ─── Change password (local accounts) ─────────────────────
  app.patch('/password', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { sub: userId, email, role } = request.user
    const body = changePasswordSchema.parse(request.body)

    const user = await db.selectFrom('users').select('password_hash').where('id', '=', userId).executeTakeFirst()
    if (!user?.password_hash) return reply.code(400).send({ error: 'No local password on this account' })
    // 400, not 401: the frontend turns any 401 into a redirect to /login
    if (!await bcrypt.compare(body.currentPassword, user.password_hash)) {
      return reply.code(400).send({ error: 'Invalid current password' })
    }

    // password_changed_at revokes every other session; this one gets a fresh token
    await db.updateTable('users')
      .set({ password_hash: await bcrypt.hash(body.newPassword, 12), password_changed_at: new Date(), updated_at: new Date() })
      .where('id', '=', userId)
      .execute()
    setAuthCookie(reply, app.jwt.sign({ sub: userId, email, role }))
    await logAudit(userId, 'user.password_change', { ipAddress: request.ip })
    return reply.code(204).send()
  })

  // ─── Forgot password: e-mails a one-hour reset link ───────
  app.post('/password/forgot', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!isMailEnabled()) return reply.code(404).send({ error: 'Password reset is disabled' })
    const { email } = forgotPasswordSchema.parse(request.body)

    const user = await db.selectFrom('users').select(['id', 'email', 'password_hash', 'is_active'])
      .where('email', '=', email).executeTakeFirst()
    // Same answer for every address (no user enumeration); SSO-only accounts have no password to reset
    // One e-mail per account per minute, whatever the source IP (mail bombing)
    const cooldown = user?.is_active && user.password_hash
      && await getRedis().set(`pwreset:cooldown:${user.id}`, '1', 'EX', 60, 'NX')
    if (user && cooldown) {
      const token = crypto.randomBytes(32).toString('hex')
      const pending: PendingReset = { userId: user.id, issuedAt: Date.now() }
      await getRedis().set(resetKey(token), JSON.stringify(pending), 'EX', RESET_TTL_SECONDS)
      const link = `${config.FRONTEND_URL}/reset-password?token=${token}`
      // Not awaited: the SMTP round-trip would tell existing addresses apart by response time
      sendMail(user.email, 'Nid — réinitialiser votre mot de passe / reset your password', [
        'Pour choisir un nouveau mot de passe Nid, ouvrez ce lien (valable 1 heure) :',
        'To choose a new Nid password, open this link (valid for 1 hour):',
        '', link, '',
        "Si vous n'avez rien demandé, ignorez cet e-mail. / If you did not ask for this, ignore this e-mail.",
      ].join('\n')).catch((err) => app.log.error({ err, userId: user.id }, 'password reset e-mail failed'))
    }
    return reply.code(204).send()
  })

  // ─── Reset password with the e-mailed token (single use) ──
  app.post('/password/reset', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body)
    const raw = await getRedis().getdel(resetKey(body.token))
    const pending = raw ? JSON.parse(raw) as PendingReset : null

    const user = pending && await db.selectFrom('users').select(['id', 'is_active', 'password_changed_at'])
      .where('id', '=', pending.userId).executeTakeFirst()
    // A link issued before the last password change (another link already used, admin reset…) is dead
    const stale = user?.password_changed_at && new Date(user.password_changed_at).getTime() > pending!.issuedAt
    if (!user?.is_active || stale) return reply.code(400).send({ error: 'Invalid or expired link' })

    await db.updateTable('users')
      .set({ password_hash: await bcrypt.hash(body.newPassword, 12), password_changed_at: new Date(), updated_at: new Date() })
      .where('id', '=', user.id)
      .execute()
    await logAudit(user.id, 'user.password_reset', { ipAddress: request.ip })
    // No session opened here: signing in again goes through the 2FA check
    return reply.code(204).send()
  })

  // ─── GDPR export of all the user's data ───────────────────
  app.get('/me/export', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub
    const data = await exportUserData(userId)
    await logAudit(userId, 'user.export_data', { ipAddress: request.ip })
    return reply
      .header('Content-Disposition', `attachment; filename="nid-export-${new Date().toISOString().slice(0, 10)}.json"`)
      .send(data)
  })

  // ─── Delete own account (irreversible) ────────────────────
  app.delete('/me', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub
    const body = deleteAccountSchema.parse(request.body ?? {})

    const user = await db.selectFrom('users').select(['email', 'password_hash']).where('id', '=', userId).executeTakeFirst()
    if (!user) return reply.code(404).send({ error: 'User not found' })
    const confirmed = user.password_hash
      ? !!body.password && await bcrypt.compare(body.password, user.password_hash)
      : body.email?.trim().toLowerCase() === user.email.toLowerCase()
    if (!confirmed) return reply.code(401).send({ error: 'Confirmation failed' })

    await deleteUser(userId)
    clearAuthCookie(reply)
    return reply.code(204).send()
  })

  // ─── Google SSO (redirige vers le flow social Arctic) ──────
  app.get('/google', async () => {
    // Use the social provider URL which goes through Arctic
    const state = crypto.randomBytes(32).toString('hex')
    const { url, codeVerifier } = createAuthorizationUrl('google', state)
    const redis = getRedis()
    await redis.set(`social:state:${state}`, JSON.stringify({ provider: 'google', codeVerifier }), 'EX', 300)
    return { url }
  })

  // Google callback — uses Arctic for code validation
  app.get('/google/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string }

    const redis = getRedis()
    const stored = await redis.get(`social:state:${state}`)
    if (!stored) {
      return reply.redirect(`${config.FRONTEND_URL}/login?google=error`)
    }
    await redis.del(`social:state:${state}`)

    const { codeVerifier } = JSON.parse(stored)

    try {
      const user = await exchangeSocialCode('google', code, codeVerifier)
      const authCode = await issueSsoCode(user, reply, request.ip, 'user.login_sso')
      return reply.redirect(`${config.FRONTEND_URL}/login?sso_code=${authCode}`)
    } catch (err: unknown) {
      app.log.error(err)
      const msg = err instanceof Error && err.message === 'Account is disabled' ? 'disabled' : 'error'
      return reply.redirect(`${config.FRONTEND_URL}/login?google=${msg}`)
    }
  })

  // Exchange SSO auth code for user info. Without 2FA the token is already in the cookie;
  // with 2FA the session is only opened here, once the TOTP code is verified.
  app.post('/google/exchange', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { code, totpCode } = ssoExchangeSchema.parse(request.body)
    const redis = getRedis()
    const key = `sso:code:${code}`
    const data = await redis.get(key)
    if (!data) return reply.code(401).send({ error: 'Invalid or expired code' })

    const pending: PendingSsoLogin = JSON.parse(data)
    const user = { id: pending.id, email: pending.email, role: pending.role }
    if (!pending.totpRequired) {
      await redis.del(key)
      return user
    }

    if (!totpCode) return reply.code(403).send({ error: 'TOTP_REQUIRED' })

    const row = await db
      .selectFrom('users')
      .select(['totp_secret', 'is_active'])
      .where('id', '=', user.id)
      .executeTakeFirst()
    const valid = !!row?.is_active && !!row.totp_secret
      && otpVerify({ token: totpCode, secret: row.totp_secret }).valid
    if (!valid) {
      // The code stays usable for a few retries, then the user must restart the SSO flow
      const attemptsKey = `sso:attempts:${code}`
      const attempts = await redis.incr(attemptsKey)
      await redis.expire(attemptsKey, SSO_TOTP_TTL_SECONDS)
      if (attempts >= SSO_TOTP_MAX_ATTEMPTS) await redis.del(key)
      return reply.code(401).send({ error: 'Invalid TOTP code' })
    }

    await redis.del(key)
    setAuthCookie(reply, app.jwt.sign({ sub: user.id, email: user.email, role: user.role }))
    await logAudit(user.id, pending.auditAction, { details: pending.auditDetails, ipAddress: request.ip })
    return user
  })

  // ─── Me ───────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub

    const user = await db
      .selectFrom('users')
      .select((eb) => ['id', 'email', 'role', 'display_name', 'avatar_url', 'is_active',
               'max_gmail_accounts', 'storage_quota_bytes', 'totp_enabled', 'created_at',
               // Local account (password change, delete confirmation) vs SSO-only
               eb('password_hash', 'is not', null).as('has_password')])
      .where('id', '=', userId)
      .executeTakeFirst()

    const accounts = await db
      .selectFrom('mail_accounts')
      .select((eb) => [
        'id', 'email', 'is_active', 'created_at', 'backup_enabled', 'backup_interval', 'provider',
        // IMAP settings to prefill « Mettre à jour le mot de passe »; the sealed password never leaves the server
        'imap_host', 'imap_port', 'imap_secure', 'imap_user',
        // « Action requise » (§7.7): Google refused the refresh token
        eb('auth_error_at', 'is not', null).as('needs_reauth'),
        // Last label sync (daily, or « Synchroniser maintenant »)
        eb.selectFrom('gmail_labels')
          .select((l) => l.fn.max('gmail_labels.updated_at').as('at'))
          .whereRef('gmail_labels.account_id', '=', 'mail_accounts.id')
          .as('last_sync_at'),
      ])
      .where('user_id', '=', userId)
      .execute()

    // Calculer l'espace utilisé par les archives
    const storageUsed = await db
      .selectFrom('archived_mails')
      .innerJoin('mail_accounts', 'archived_mails.account_id', 'mail_accounts.id')
      .select((eb) => eb.fn.sum<string>('archived_mails.size_bytes').as('total'))
      .where('mail_accounts.user_id', '=', userId)
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
      .selectFrom('mail_accounts')
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
      // Not awaited: the redirect must not wait on Gmail; the daily scheduler retries on failure
      syncLabels(account.id).catch((err) => app.log.warn({ err, accountId: account.id }, 'initial label sync failed'))
      const added = account.inserted ? '&new=1' : '' // opens the setup wizard (§7.7)
      return reply.redirect(`${config.FRONTEND_URL}/settings/gmail?gmail=connected&account=${encodeURIComponent(account.email)}${added}`)
    } catch (err) {
      app.log.error(err)
      return reply.redirect(`${config.FRONTEND_URL}/settings/gmail?gmail=error`)
    }
  })

  app.delete('/gmail/:accountId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const { accountId }      = request.params as { accountId: string }

    // Soft disconnect: Gmail access stops (tokens dropped, no sync, no backup) but the row stays, so its archives
    // remain in Nid; reconnecting the same address reactivates this row (exchangeGmailCode upsert)
    await db
      .updateTable('mail_accounts')
      .set({ is_active: false, access_token: null, refresh_token: null, updated_at: new Date() })
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .execute()

    return reply.code(204).send()
  })

  // ─── Toggle Gmail account active/inactive ──────────────────
  app.patch('/gmail/:accountId/toggle', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const { accountId } = request.params as { accountId: string }

    const account = await db
      .selectFrom('mail_accounts')
      .select(['id', 'is_active', 'refresh_token'])
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!account) return reply.code(404).send({ error: 'Account not found' })
    // A disconnected account has no token left: only the Google consent can bring it back
    if (!account.is_active && !account.refresh_token) return reply.code(409).send({ error: 'Gmail account disconnected: reconnect it in Settings' })

    const newStatus = !account.is_active

    await db
      .updateTable('mail_accounts')
      .set({ is_active: newStatus })
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .execute()

    return { id: accountId, is_active: newStatus }
  })

  // ─── Gmail account settings (B12) ──────────────────────────
  app.patch('/gmail/:accountId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const accountId = z.string().uuid().safeParse((request.params as { accountId: string }).accountId)
    if (!accountId.success) return reply.code(404).send({ error: 'Account not found' })
    const parsed = accountSettingsSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' })

    const account = await db
      .updateTable('mail_accounts')
      .set({ ...parsed.data, updated_at: new Date() })
      .where('id', '=', accountId.data)
      .where('user_id', '=', request.user.sub)
      .returning(['id', 'backup_enabled', 'backup_interval'])
      .executeTakeFirst()

    if (!account) return reply.code(404).send({ error: 'Account not found' })
    return account
  })

  // ─── Social OAuth (Arctic — server-side callback) ──────────

  app.get('/social/:provider/url', async (request, reply) => {
    const { provider } = request.params as { provider: string }

    if (!isProviderEnabled(provider)) {
      return reply.code(400).send({ error: `Provider ${provider} is not configured` })
    }

    const state = crypto.randomBytes(32).toString('hex')
    const { url, codeVerifier } = createAuthorizationUrl(provider, state)

    // Store state + codeVerifier in Redis (5 min TTL)
    const redis = getRedis()
    await redis.set(`social:state:${state}`, JSON.stringify({ provider, codeVerifier }), 'EX', 300)

    return { url }
  })

  app.get('/social/:provider/callback', async (request, reply) => {
    const { provider } = request.params as { provider: string }
    const { code, state } = request.query as { code: string; state: string }

    if (!isProviderEnabled(provider)) {
      return reply.redirect(`${config.FRONTEND_URL}/login?social=error`)
    }

    const redis = getRedis()
    const stored = await redis.get(`social:state:${state}`)
    if (!stored) {
      return reply.redirect(`${config.FRONTEND_URL}/login?social=error`)
    }
    await redis.del(`social:state:${state}`)

    const { provider: storedProvider, codeVerifier } = JSON.parse(stored)
    if (storedProvider !== provider) {
      return reply.redirect(`${config.FRONTEND_URL}/login?social=error`)
    }

    try {
      const user = await exchangeSocialCode(provider, code, codeVerifier)
      // Pass a short-lived auth code for frontend user info (same pattern as Google SSO)
      const authCode = await issueSsoCode(user, reply, request.ip, 'user.login_social', { provider })
      return reply.redirect(`${config.FRONTEND_URL}/login?sso_code=${authCode}`)
    } catch (err: unknown) {
      app.log.error(err)
      const msg = err instanceof Error && err.message === 'Account is disabled' ? 'disabled' : 'error'
      return reply.redirect(`${config.FRONTEND_URL}/login?social=${msg}`)
    }
  })
}
