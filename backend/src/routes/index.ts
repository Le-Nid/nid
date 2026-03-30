import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth'
import { gmailRoutes } from './gmail'
import { archiveRoutes } from './archive'
import { jobRoutes } from './jobs'
import { dashboardRoutes } from './dashboard'
import { rulesRoutes } from './rules'
import { jobSseRoutes, startQueueEventBroadcaster } from './job-sse'
import { adminRoutes } from './admin'

export async function registerRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  await app.register(authRoutes,      { prefix: '/api/auth' })
  await app.register(gmailRoutes,     { prefix: '/api/gmail' })
  await app.register(archiveRoutes,   { prefix: '/api/archive' })
  await app.register(jobRoutes,       { prefix: '/api/jobs' })
  await app.register(jobSseRoutes,    { prefix: '/api/jobs' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(rulesRoutes,     { prefix: '/api/rules' })
  await app.register(adminRoutes,     { prefix: '/api/admin' })

  // Démarrer le broadcaster SSE ← QueueEvents BullMQ
  startQueueEventBroadcaster()
}
