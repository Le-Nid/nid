import { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { config } from '../config'
import { connectDb } from './db'
import { connectRedis } from './redis'

export async function registerPlugins(app: FastifyInstance) {
  // CORS
  await app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  })

  // JWT
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRY },
  })

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Swagger (API docs — available at /docs)
  await app.register(swagger, {
    openapi: {
      info: { title: 'Gmail Manager API', version: '1.0.0' },
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

  // Decorate request with auth helper
  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify()
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
      .selectFrom('gmail_accounts')
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
