import { FastifyInstance } from 'fastify'

export function authPresets(app: FastifyInstance) {
  return {
    auth: { preHandler: [app.authenticate] },
    accountAuth: { preHandler: [app.authenticate, app.requireAccountOwnership] },
    adminAuth: { preHandler: [app.authenticate, app.requireAdmin] },
  }
}
