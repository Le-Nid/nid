import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { getDb } from '../db'
import { getGmailAuthUrl, exchangeGmailCode } from '../auth/oauth.service'
import { config } from '../config'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})
const loginSchema = registerSchema

export async function authRoutes(app: FastifyInstance) {
  const db = getDb()

  // ─── Register ─────────────────────────────────────────────
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const hash = await bcrypt.hash(body.password, 12)

    const existing = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', body.email)
      .executeTakeFirst()

    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const user = await db
      .insertInto('users')
      .values({ email: body.email, password_hash: hash })
      .returning(['id', 'email'])
      .executeTakeFirstOrThrow()

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return reply.code(201).send({ token, user: { id: user.id, email: user.email } })
  })

  // ─── Login ────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash'])
      .where('email', '=', body.email)
      .executeTakeFirst()

    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email } }
  })

  // ─── Me ───────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string }

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirst()

    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email', 'is_active', 'created_at'])
      .where('user_id', '=', userId)
      .execute()

    return { user, gmailAccounts: accounts }
  })

  // ─── Gmail OAuth2 ──────────────────────────────────────────
  app.get('/gmail/connect', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string }
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
