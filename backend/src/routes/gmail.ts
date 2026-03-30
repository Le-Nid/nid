import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  listMessages, getMessage, getMessageFull,
  trashMessages, deleteMessages, modifyMessages,
  listLabels, createLabel, deleteLabel, getMailboxProfile
} from '../gmail/gmail.service'
import { enqueueJob } from '../jobs/queue'
import { logAudit } from '../audit/audit.service'

export async function gmailRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate, app.requireAccountOwnership] }

  // ─── Profile ──────────────────────────────────────────
  app.get('/:accountId/profile', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getMailboxProfile(accountId)
  })

  // ─── Messages ─────────────────────────────────────────
  app.get('/:accountId/messages', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { q, pageToken, maxResults } = request.query as {
      q?: string; pageToken?: string; maxResults?: string
    }
    return listMessages(accountId, { query: q, pageToken, maxResults: Number(maxResults) || 50 })
  })

  app.get('/:accountId/messages/:messageId', auth, async (request) => {
    const { accountId, messageId } = request.params as { accountId: string; messageId: string }
    return getMessage(accountId, messageId)
  })

  app.get('/:accountId/messages/:messageId/full', auth, async (request) => {
    const { accountId, messageId } = request.params as { accountId: string; messageId: string }
    return getMessageFull(accountId, messageId)
  })

  // ─── Bulk operations (async via BullMQ) ───────────────
  const bulkSchema = z.object({
    action: z.enum(['trash', 'delete', 'label', 'unlabel', 'mark_read', 'mark_unread', 'archive']),
    messageIds: z.array(z.string()).min(1, 'No messageIds provided').max(5000),
    labelId: z.string().optional(),
  })

  app.post('/:accountId/messages/bulk', auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { sub: userId } = request.user as { sub: string }
    const { action, messageIds, labelId } = bulkSchema.parse(request.body)

    const job = await enqueueJob('bulk_operation', {
      accountId,
      userId,
      action,
      messageIds,
      labelId,
    })

    await logAudit(userId, `bulk.${action === 'trash' ? 'trash' : action === 'delete' ? 'delete' : action === 'archive' ? 'archive' : 'label'}` as any, {
      targetType: 'messages', targetId: accountId,
      details: { action, count: messageIds.length, jobId: job.id },
    })

    return reply.code(202).send({ jobId: job.id, message: 'Job enqueued' })
  })

  // ─── Labels ───────────────────────────────────────────
  app.get('/:accountId/labels', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return listLabels(accountId)
  })

  app.post('/:accountId/labels', auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { name } = request.body as { name: string }
    const label = await createLabel(accountId, name)
    return reply.code(201).send(label)
  })

  app.delete('/:accountId/labels/:labelId', auth, async (request, reply) => {
    const { accountId, labelId } = request.params as { accountId: string; labelId: string }
    await deleteLabel(accountId, labelId)
    return reply.code(204).send()
  })
}
