import { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import multipart from '@fastify/multipart'
import { ZodError } from 'zod'
import { config } from '../config'
import { connectDb } from './db'
import { connectRedis } from './redis'
import { API_TOKEN_RE, verifyApiToken } from '../auth/api-tokens.service'

export async function registerPlugins(app: FastifyInstance) {
  // CORS
  await app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  })

  // Cookie
  await app.register(cookie)

  // JWT — tokens read from httpOnly cookie or Authorization header
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRY, algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  })

  // Rate limiting (global)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Multipart (file uploads — used by mbox import)
  await app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  })

  // Swagger (API docs — available at /docs)
  await app.register(swagger, {
    openapi: {
      info: { title: 'Nid API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  // Database & Redis
  await connectDb(app)
  await connectRedis(app)

  // ─── Global error handler (Point 16) ──────────────────────
  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn({ validationErrors: error.issues, url: request.url, method: request.method }, 'validation failed')
      return reply.code(400).send({ error: 'Validation failed', details: error.issues })
    }
    if (error.statusCode && error.statusCode < 500) {
      request.log.warn({ statusCode: error.statusCode, url: request.url, method: request.method }, error.message)
      return reply.code(error.statusCode).send({ error: error.message })
    }
    request.log.error({ err: error, url: request.url, method: request.method, userId: (request.user as any)?.sub }, 'unhandled error')
    reply.code(error.statusCode ?? 500).send({ error: 'Internal server error' })
  })

  // ─── Auth helper: verify JWT + check blacklist + check user is still active (Point 6, 13) ──
  app.decorate('authenticate', async function (request: any, reply: any) {
    const apiToken = request.headers.authorization?.match(/^Bearer (nid_\S+)$/)?.[1]
    if (apiToken) return authenticateApiToken(request, reply, apiToken)
    try {
      await request.jwtVerify()

      // Point 13: check JWT blacklist (logout invalidation)
      const raw = request.cookies?.token ?? request.headers.authorization?.replace('Bearer ', '')
      if (raw) {
        const blacklisted = await app.redis.get(`jwt:blacklist:${raw}`)
        if (blacklisted) {
          return reply
            .clearCookie('token', { path: '/' })
            .code(401)
            .send({ error: 'Unauthorized' })
        }
      }

      const { sub: userId } = request.user as { sub: string }
      const user = await app.db
        .selectFrom('users')
        .select(['id', 'is_active', 'role', 'password_changed_at'])
        .where('id', '=', userId)
        .executeTakeFirst()
      // iat is in seconds: a token issued in the same second as the change stays valid (the re-issued one)
      const issuedBefore = user?.password_changed_at
        && (request.user.iat ?? 0) < Math.floor(new Date(user.password_changed_at).getTime() / 1000)
      if (!user?.is_active || issuedBefore) {
        return reply
          .clearCookie('token', { path: '/' })
          .code(401)
          .send({ error: 'Unauthorized' })
      }
      // Keep role in sync with DB
      request.user.role = user.role
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // Vérifie que l'accountId dans les params appartient au user authentifié
  app.decorate('requireAccountOwnership', async function (request: any, reply: any) {
    const { sub: userId } = request.user as { sub: string }
    const { accountId } = request.params as { accountId: string }
    if (!accountId) return // pas d'accountId dans cette route

    const { db: database } = app
    const account = await database
      .selectFrom('mail_accounts')
      .select('id')
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!account) {
      return reply.code(403).send({ error: 'Forbidden: account does not belong to you' })
    }
  })

  // Vérifie que l'utilisateur authentifié est admin
  app.decorate('requireAdmin', async function (request: any, reply: any) {
    const { role } = request.user as { role: string }
    if (role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' })
    }
  })
}

// Account security, tokens, administration, and what could leak or lock the archives stay session-only
const API_TOKEN_DENIED = ['/api/auth', '/api/admin', '/api/privacy', '/api/webhooks', '/api/shares']

async function authenticateApiToken(request: any, reply: any, raw: string) {
  const found = API_TOKEN_RE.test(raw) ? await verifyApiToken(raw) : null
  if (!found) return reply.code(401).send({ error: 'Unauthorized' })
  // The matched route pattern, not request.url: an encoded path cannot slip past the prefix check
  const route: string = request.routeOptions?.url ?? ''
  if (API_TOKEN_DENIED.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) {
    return reply.code(403).send({ error: 'Not available with an API token' })
  }
  if (found.scope === 'read' && request.method !== 'GET' && request.method !== 'HEAD') {
    return reply.code(403).send({ error: 'Read-only API token' })
  }
  // Never admin through a token, whatever the owner's role
  request.user = { sub: found.userId, email: found.email, role: 'user' }
}

/** Helper to set auth cookie on reply */
export function setAuthCookie(reply: any, token: string) {
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24h (seconds)
  })
}

/** Helper to clear auth cookie on reply */
export function clearAuthCookie(reply: any) {
  reply.clearCookie('token', { path: '/' })
}
