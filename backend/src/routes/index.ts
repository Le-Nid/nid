import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth'
import { gmailRoutes } from './gmail'
import { archiveRoutes } from './archive'
import { jobRoutes } from './jobs'
import { dashboardRoutes } from './dashboard'

export async function registerRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(gmailRoutes, { prefix: '/api/gmail' })
  await app.register(archiveRoutes, { prefix: '/api/archive' })
  await app.register(jobRoutes, { prefix: '/api/jobs' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
}
