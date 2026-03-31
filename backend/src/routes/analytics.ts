import { FastifyInstance } from 'fastify'
import { authPresets } from '../utils/auth'
import {
  getHeatmap,
  getSenderScores,
  getCleanupSuggestions,
  dismissSuggestion,
  getInboxZeroData,
  recordInboxSnapshot,
} from '../analytics/analytics.service'

export async function analyticsRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── Heatmap d'activité email ───────────────────────────
  app.get<{
    Params: { accountId: string }
    Querystring: { refresh?: string }
  }>('/:accountId/heatmap', accountAuth, async (request) => {
    const { accountId } = request.params
    const refresh = request.query.refresh === '1'
    return getHeatmap(accountId, refresh)
  })

  // ─── Score d'encombrement par expéditeur ────────────────
  app.get<{
    Params: { accountId: string }
    Querystring: { refresh?: string }
  }>('/:accountId/sender-scores', accountAuth, async (request) => {
    const { accountId } = request.params
    const refresh = request.query.refresh === '1'
    return getSenderScores(accountId, refresh)
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
  }>('/suggestions/:suggestionId/dismiss', { preHandler: [app.authenticate] }, async (request) => {
    const { suggestionId } = request.params
    await dismissSuggestion(suggestionId)
    return { ok: true }
  })

  // ─── Inbox Zero tracker ─────────────────────────────────
  app.get<{
    Params: { accountId: string }
    Querystring: { refresh?: string }
  }>('/:accountId/inbox-zero', accountAuth, async (request) => {
    const { accountId } = request.params
    const refresh = request.query.refresh === '1'
    return getInboxZeroData(accountId, refresh)
  })

  // ─── Snapshot inbox (appelé par le scheduler) ───────────
  app.post<{
    Params: { accountId: string }
  }>('/:accountId/inbox-zero/snapshot', accountAuth, async (request) => {
    const { accountId } = request.params
    return recordInboxSnapshot(accountId)
  })
}
