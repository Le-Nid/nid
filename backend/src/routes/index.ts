import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth'
import { gmailRoutes } from './gmail'
import { archiveRoutes } from './archive'
import { jobRoutes } from './jobs'
import { dashboardRoutes } from './dashboard'
import { rulesRoutes } from './rules'
import { jobSseRoutes, startQueueEventBroadcaster } from './job-sse'
import { adminRoutes } from './admin'
import { unsubscribeRoutes } from './unsubscribe'
import { attachmentsRoutes } from './attachments'
import { reportsRoutes } from './reports'
import { notificationsRoutes } from './notifications'
import { auditRoutes } from './audit'
import { twoFactorRoutes } from './2fa'
import { passkeyRoutes } from './passkeys'
import { integrityRoutes } from './integrity'
import { webhookRoutes } from './webhooks'
import { configRoutes } from './config'
import { privacyRoutes } from './privacy'
import { analyticsRoutes } from './analytics'
import { savedSearchRoutes } from './saved-searches'
import { unifiedRoutes } from './unified'
import { retentionRoutes } from './retention'
import { quotaRoutes } from './quota'
import { importRoutes } from './import'
import { expirationRoutes } from './expiration'
import { sharingRoutes } from './sharing'
import { eventsRoutes } from './events'
import { labelsRoutes } from './labels'
import { registerMetrics } from './metrics'
import { aboutRoutes } from './about'
import { config } from '../config'

export async function registerRoutes(app: FastifyInstance) {
  await registerMetrics(app)

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: config.APP_VERSION,
    timestamp: new Date().toISOString(),
  }))

  // API routes
  await app.register(authRoutes,      { prefix: '/api/auth' })
  await app.register(gmailRoutes,     { prefix: '/api/gmail' })
  await app.register(archiveRoutes,   { prefix: '/api/archive' })
  await app.register(jobRoutes,       { prefix: '/api/jobs' })
  await app.register(jobSseRoutes,    { prefix: '/api/jobs' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(rulesRoutes,     { prefix: '/api/rules' })
  await app.register(adminRoutes,       { prefix: '/api/admin' })
  await app.register(unsubscribeRoutes,  { prefix: '/api/unsubscribe' })
  await app.register(attachmentsRoutes,  { prefix: '/api/attachments' })
  await app.register(reportsRoutes,      { prefix: '/api/reports' })
  await app.register(notificationsRoutes, { prefix: '/api/notifications' })
  await app.register(auditRoutes,         { prefix: '/api/audit' })
  await app.register(twoFactorRoutes,     { prefix: '/api/auth/2fa' })
  await app.register(passkeyRoutes,       { prefix: '/api/auth/passkeys' })
  await app.register(integrityRoutes,     { prefix: '/api/integrity' })
  await app.register(webhookRoutes,       { prefix: '/api/webhooks' })
  await app.register(configRoutes,        { prefix: '/api/config' })
  await app.register(privacyRoutes,       { prefix: '/api/privacy' })
  await app.register(analyticsRoutes,     { prefix: '/api/analytics' })
  await app.register(savedSearchRoutes,   { prefix: '/api/saved-searches' })
  await app.register(unifiedRoutes,       { prefix: '/api/unified' })
  await app.register(retentionRoutes,     { prefix: '/api/retention' })
  await app.register(quotaRoutes,         { prefix: '/api/quota' })
  await app.register(importRoutes,        { prefix: '/api/import' })
  await app.register(expirationRoutes,    { prefix: '/api/expiration' })
  await app.register(sharingRoutes,       { prefix: '/api/shares' })
  await app.register(eventsRoutes,        { prefix: '/api/events' })
  await app.register(labelsRoutes,        { prefix: '/api/labels' })
  await app.register(aboutRoutes,         { prefix: '/api/about' })

  // Démarrer le broadcaster SSE ← QueueEvents BullMQ
  startQueueEventBroadcaster()
}
