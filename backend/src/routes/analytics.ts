import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authPresets } from '../utils/auth'
import { notFound } from '../utils/db'
import {
  getHeatmap,
  getCleanupSuggestions,
  dismissSuggestion,
  getInboxZeroData,
} from '../analytics/analytics.service'

/** An IANA zone name the runtime knows (`Europe/Paris`), so PostgreSQL's AT TIME ZONE gets a real one. */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function analyticsRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── Heatmap d'activité email (archives, fuseau du navigateur) ───
  const heatmapQuerySchema = z.object({ tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone').default('UTC') })

  app.get('/:accountId/heatmap', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getHeatmap(accountId, heatmapQuerySchema.parse(request.query).tz)
  })

  // ─── Suggestions de nettoyage ───────────────────────────
  app.get<{
    Params: { accountId: string }
    Querystring: { refresh?: string }
  }>('/:accountId/cleanup-suggestions', accountAuth, async (request) => {
    const { accountId } = request.params
    const refresh = request.query.refresh === '1'
    return getCleanupSuggestions(accountId, refresh)
  })

  // ─── Dismiss une suggestion ─────────────────────────────
  app.patch<{
    Params: { suggestionId: string }
  }>('/suggestions/:suggestionId/dismiss', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { suggestionId } = request.params
    if (!(await dismissSuggestion(suggestionId, request.user.sub))) return notFound(reply, 'Suggestion not found')
    return { ok: true }
  })

  // ─── Inbox Zero tracker ─────────────────────────────────
  // No refresh: a snapshot costs Gmail calls, the scheduler takes one every 6 h
  app.get<{ Params: { accountId: string } }>('/:accountId/inbox-zero', accountAuth, async (request) => {
    return getInboxZeroData(request.params.accountId)
  })
}
