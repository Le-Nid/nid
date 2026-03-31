import { FastifyInstance } from 'fastify'
import { scanNewsletters, getNewsletterMessageIds } from '../unsubscribe/unsubscribe.service'
import { enqueueJob } from '../jobs/queue'
import { authPresets } from '../utils/auth'

export async function unsubscribeRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── Scan newsletters (async job) ─────────────────────
  app.post('/:accountId/scan', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub

    const job = await enqueueJob('scan_unsubscribe', { accountId, userId })
    return reply.code(202).send({ jobId: job.id, message: 'Scan enqueued' })
  })

  // ─── Scan sync (for smaller mailboxes, returns data directly) ─
  app.get('/:accountId/newsletters', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return scanNewsletters(accountId)
  })

  // ─── Get all message IDs for a sender ─────────────────
  app.get('/:accountId/newsletters/:senderEmail/messages', accountAuth, async (request) => {
    const { accountId, senderEmail } = request.params as { accountId: string; senderEmail: string }
    const ids = await getNewsletterMessageIds(accountId, decodeURIComponent(senderEmail))
    return { messageIds: ids, count: ids.length }
  })

  // ─── Bulk delete all from a newsletter sender ─────────
  app.post('/:accountId/newsletters/:senderEmail/delete', accountAuth, async (request, reply) => {
    const { accountId, senderEmail } = request.params as { accountId: string; senderEmail: string }
    const userId = request.user.sub
    const { permanent = false } = request.body as { permanent?: boolean }

    const messageIds = await getNewsletterMessageIds(accountId, decodeURIComponent(senderEmail))
    if (messageIds.length === 0) return { deleted: 0 }

    const job = await enqueueJob('bulk_operation', {
      accountId,
      userId,
      action: permanent ? 'delete' : 'trash',
      messageIds,
    })
    return reply.code(202).send({ jobId: job.id, count: messageIds.length })
  })
}
