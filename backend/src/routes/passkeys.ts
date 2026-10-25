import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'node:crypto'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON,
} from '@simplewebauthn/server'
import { getDb } from '../db'
import { config } from '../config'
import { logAudit } from '../audit/audit.service'
import { setAuthCookie } from '../plugins'
import { getRedis } from '../plugins/redis'
import { authPresets } from '../utils/auth'
import { UUID_RE, notFound } from '../utils/db'

const CHALLENGE_TTL_SECONDS = 300

// The relying party is the frontend's site: passkeys only work on that exact origin (FRONTEND_URL)
const rp = () => {
  const url = new URL(config.FRONTEND_URL)
  return { id: url.hostname, origin: url.origin }
}

// The browser's JSON is checked by the library itself: here only its outer shape and size are bounded
const credentialJson = z.object({ id: z.string().max(1024), type: z.literal('public-key') }).passthrough()
const registerSchema = z.object({ name: z.string().trim().min(1).max(64), response: credentialJson })
const loginSchema = z.object({ challengeId: z.string().regex(/^[0-9a-f]{32}$/), response: credentialJson })

export async function passkeyRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  // ─── List ─────────────────────────────────────────────────
  app.get('/', auth, (request) => db
    .selectFrom('passkeys')
    .select(['id', 'name', 'created_at', 'last_used_at'])
    .where('user_id', '=', request.user.sub)
    .orderBy('created_at')
    .execute())

  // ─── Register: options, then the browser's answer ─────────
  app.post('/register/options', auth, async (request) => {
    const { sub: userId, email } = request.user
    const existing = await db.selectFrom('passkeys').select(['credential_id', 'transports'])
      .where('user_id', '=', userId).execute()
    const options = await generateRegistrationOptions({
      rpName: 'Nid',
      rpID: rp().id,
      userName: email,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      // Discoverable + user verification: the passkey alone (with its PIN/biometrics) signs in, no e-mail typed
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports })),
    })
    await getRedis().set(`webauthn:reg:${userId}`, options.challenge, 'EX', CHALLENGE_TTL_SECONDS)
    return options
  })

  app.post('/register/verify', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub
    const body = registerSchema.parse(request.body)
    const challenge = await getRedis().getdel(`webauthn:reg:${userId}`)
    if (!challenge) return reply.code(400).send({ error: 'Registration expired, start again' })

    const result = await verifyRegistrationResponse({
      response: body.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp().origin,
      expectedRPID: rp().id,
      requireUserVerification: true,
    }).catch(() => null)
    if (!result?.verified) return reply.code(400).send({ error: 'Passkey could not be verified' })

    const { credential } = result.registrationInfo
    const passkey = await db.insertInto('passkeys').values({
      user_id: userId,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: body.name,
    }).returning(['id', 'name', 'created_at', 'last_used_at']).executeTakeFirstOrThrow()
    await logAudit(userId, 'user.passkey_add', { targetType: 'passkey', targetId: passkey.id, ipAddress: request.ip })
    return reply.code(201).send(passkey)
  })

  // ─── Remove ───────────────────────────────────────────────
  app.delete('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!UUID_RE.test(id)) return notFound(reply, 'Passkey not found')
    const removed = await db.deleteFrom('passkeys').where('id', '=', id).where('user_id', '=', request.user.sub)
      .returning('id').executeTakeFirst()
    if (!removed) return notFound(reply, 'Passkey not found')
    await logAudit(request.user.sub, 'user.passkey_remove', { targetType: 'passkey', targetId: id, ipAddress: request.ip })
    return reply.code(204).send()
  })

  // ─── Sign in: options, then the browser's signature ───────
  app.post('/login/options', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async () => {
    // No allowCredentials: the browser offers the passkeys it holds for this site (discoverable credentials)
    const options = await generateAuthenticationOptions({ rpID: rp().id, userVerification: 'required' })
    const challengeId = crypto.randomBytes(16).toString('hex')
    await getRedis().set(`webauthn:auth:${challengeId}`, options.challenge, 'EX', CHALLENGE_TTL_SECONDS)
    return { challengeId, options }
  })

  app.post('/login/verify', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const challenge = await getRedis().getdel(`webauthn:auth:${body.challengeId}`)
    const passkey = challenge ? await db
      .selectFrom('passkeys')
      .innerJoin('users', 'users.id', 'passkeys.user_id')
      .select(['passkeys.id', 'passkeys.public_key', 'passkeys.counter', 'passkeys.transports',
        'users.id as user_id', 'users.email', 'users.role', 'users.is_active'])
      .where('passkeys.credential_id', '=', body.response.id)
      .executeTakeFirst() : undefined
    // Same answer for an expired challenge, an unknown passkey or a disabled account
    if (!challenge || !passkey?.is_active) return reply.code(401).send({ error: 'Passkey sign-in failed' })

    const result = await verifyAuthenticationResponse({
      response: body.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp().origin,
      expectedRPID: rp().id,
      credential: {
        id: body.response.id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
      requireUserVerification: true,
    }).catch(() => null)
    if (!result?.verified) return reply.code(401).send({ error: 'Passkey sign-in failed' })

    await db.updateTable('passkeys')
      .set({ counter: result.authenticationInfo.newCounter, last_used_at: new Date() })
      .where('id', '=', passkey.id).execute()
    await db.updateTable('users').set({ last_login_at: new Date() }).where('id', '=', passkey.user_id).execute()
    // A verified passkey (possession + PIN/biometrics) is already multi-factor: no TOTP asked on top
    setAuthCookie(reply, app.jwt.sign({ sub: passkey.user_id, email: passkey.email, role: passkey.role }))
    await logAudit(passkey.user_id, 'user.login_passkey', { targetType: 'passkey', targetId: passkey.id, ipAddress: request.ip })
    return { user: { id: passkey.user_id, email: passkey.email, role: passkey.role } }
  })
}
