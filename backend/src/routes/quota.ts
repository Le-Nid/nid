import { FastifyInstance } from 'fastify'
import { getQuotaStats, cleanupOldUsageData } from '../gmail/quota.service'
import { authPresets } from '../utils/auth'

export async function quotaRoutes(app: FastifyInstance) {
  const { accountAuth, adminAuth } = authPresets(app)

  // ─── Get quota stats for an account ───────────────────────
  app.get('/:accountId', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getQuotaStats(accountId)
  })

  // ─── Cleanup old usage data (admin only) ──────────────────
  app.post('/cleanup', adminAuth, async () => {
    const deleted = await cleanupOldUsageData()
    return { deleted }
  })
}
