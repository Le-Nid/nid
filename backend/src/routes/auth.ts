import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { getDb } from '../plugins/db'
import { getGmailAuthUrl, exchangeGmailCode } from '../auth/oauth.service'
import { config } from '../config'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  const db = getDb()

  // ─── Local Auth ────────────────────────────────────────
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const hash = await bcrypt.hash(body.password, 12)

    const [user] = await db`
      INSERT INTO users (email, password_hash)
      VALUES (${body.email}, ${hash})
      RETURNING id, email, created_at
    `.catch(() => {
      throw reply.code(409).send({ error: 'Email already registered' })
    })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return reply.code(201).send({ token, user: { id: user.id, email: user.email } })
  })

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const [user] = await db`
      SELECT id, email, password_hash FROM users WHERE email = ${body.email}
    `
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email } }
  })

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string; email: string }
    const [user] = await db`
      SELECT id, email, created_at FROM users WHERE id = ${userId}
    `
    const accounts = await db`
      SELECT id, email, is_active, created_at FROM gmail_accounts WHERE user_id = ${userId}
    `
    return { user, gmailAccounts: accounts }
  })

  // ─── Gmail OAuth2 ──────────────────────────────────────
  app.get('/gmail/connect', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string }
    const url = getGmailAuthUrl(userId)
    return { url }
  })

  app.get('/gmail/callback', async (request, reply) => {
    const { code, state: userId } = request.query as { code: string; state: string }

    try {
      const account = await exchangeGmailCode(code, userId)
      // Redirect to frontend with success
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=connected&account=${account.email}`)
    } catch (err) {
      app.log.error(err)
      return reply.redirect(`${config.FRONTEND_URL}/settings?gmail=error`)
    }
  })

  app.delete('/gmail/:accountId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { accountId } = request.params as { accountId: string }

    await db`
      DELETE FROM gmail_accounts WHERE id = ${accountId} AND user_id = ${userId}
    `
    return reply.code(204).send()
  })
}
