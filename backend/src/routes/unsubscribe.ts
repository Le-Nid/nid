import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getNewsletterScan, getNewsletterMessageIds, forgetNewsletterSender } from '../unsubscribe/unsubscribe.service'
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

  // ─── Last scan result (cache written by the scan job; scannedAt null = never scanned) ─
  app.get('/:accountId/newsletters', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getNewsletterScan(accountId)
  })

  // ─── Get all message IDs for a sender ─────────────────
  app.get('/:accountId/newsletters/:senderEmail/messages', accountAuth, async (request) => {
    const { accountId, senderEmail } = request.params as { accountId: string; senderEmail: string }
    const ids = await getNewsletterMessageIds(accountId, decodeURIComponent(senderEmail))
    return { messageIds: ids, count: ids.length }
  })

  // ─── Bulk delete all from a newsletter sender ─────────
  const deleteSenderSchema = z.object({
    permanent: z.boolean().default(false),
    // D1 undo window, cancellable via DELETE /api/jobs/:jobId
    delayMs: z.number().int().min(0).max(60_000).default(10_000),
  })

  app.post('/:accountId/newsletters/:senderEmail/delete', accountAuth, async (request, reply) => {
    const { accountId, senderEmail } = request.params as { accountId: string; senderEmail: string }
    const userId = request.user.sub
    const { permanent, delayMs } = deleteSenderSchema.parse(request.body ?? {})

    const email = decodeURIComponent(senderEmail)
    const messageIds = await getNewsletterMessageIds(accountId, email)
    if (messageIds.length === 0) {
      // Nothing left in Gmail: the cached row is stale
      await forgetNewsletterSender(accountId, email)
      return { deleted: 0 }
    }

    const job = await enqueueJob('bulk_operation', {
      accountId,
      userId,
      action: permanent ? 'delete' : 'trash',
      messageIds,
      senderEmail: email,
    }, { delay: delayMs })
    const runAt = new Date(Date.now() + delayMs).toISOString()
    return reply.code(202).send({ jobId: job.id, runAt, count: messageIds.length })
  })
}
