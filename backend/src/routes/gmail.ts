import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  listMessages, getMessage, getMessageFull, batchGetMessages,
  listLabels, createLabel, updateLabel, deleteLabel, getMailboxProfile,
  getGmailClient,
} from '../gmail/gmail.service'
import { trackApiCall } from '../gmail/quota.service'
import { upsertLabels, markLabelsDeleted } from '../labels/labels.service'
import { enqueueJob } from '../jobs/queue'
import { logAudit } from '../audit/audit.service'
import { authPresets } from '../utils/auth'

const labelName = z.string().trim().min(1).max(225)
const labelNameSchema = z.object({ name: labelName })
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const labelPatchSchema = z
  .object({
    name: labelName.optional(),
    color: z.object({ backgroundColor: hexColor, textColor: hexColor }).optional(),
  })
  .refine((b) => b.name !== undefined || b.color !== undefined, { message: 'name or color is required' })

export async function gmailRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── Profile ──────────────────────────────────────────
  app.get('/:accountId/profile', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getMailboxProfile(accountId)
  })

  // ─── Messages ─────────────────────────────────────────
  app.get('/:accountId/messages', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { q, pageToken, maxResults } = request.query as {
      q?: string; pageToken?: string; maxResults?: string
    }
    return listMessages(accountId, { query: q, pageToken, maxResults: Number(maxResults) || 50 })
  })

  app.get('/:accountId/messages/:messageId', accountAuth, async (request) => {
    const { accountId, messageId } = request.params as { accountId: string; messageId: string }
    return getMessage(accountId, messageId)
  })

  app.get('/:accountId/messages/:messageId/full', accountAuth, async (request) => {
    const { accountId, messageId } = request.params as { accountId: string; messageId: string }
    return getMessageFull(accountId, messageId)
  })

  // ─── Attachment data (by attachmentId from Gmail API) ─
  app.get('/:accountId/messages/:messageId/attachments/:attachmentId', accountAuth, async (request) => {
    const { accountId, messageId, attachmentId } = request.params as {
      accountId: string; messageId: string; attachmentId: string
    }
    const gmail = await getGmailClient(accountId)
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    })
    trackApiCall(accountId, 'messages.get').catch(() => {})
    return { data: res.data.data, size: res.data.size }
  })

  // ─── Batch fetch metadata ─────────────────────────────
  const batchSchema = z.object({
    ids: z.array(z.string()).min(1).max(100),
  })

  app.post('/:accountId/messages/batch', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { ids } = batchSchema.parse(request.body)
    return batchGetMessages(accountId, ids)
  })

  // ─── Bulk operations (async via BullMQ) ───────────────
  const bulkSchema = z.object({
    action: z.enum(['trash', 'label', 'unlabel', 'mark_read', 'mark_unread', 'archive']),
    messageIds: z.array(z.string()).min(1, 'No messageIds provided').max(5000).optional(),
    // B5 select-all: Gmail search string, the worker pages through its results (capped by BULK_QUERY_MAX)
    query: z.string().trim().min(1).max(2000).optional(),
    labelId: z.string().optional(),
    // D1 undo window: the job waits this long in BullMQ and can be cancelled via DELETE /api/jobs/:jobId
    delayMs: z.number().int().min(0).max(60_000).default(10_000),
  }).refine((b) => (b.messageIds === undefined) !== (b.query === undefined), {
    message: 'Provide exactly one of messageIds or query',
  })

  app.post('/:accountId/messages/bulk', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const { action, messageIds, query, labelId, delayMs } = bulkSchema.parse(request.body)

    const job = await enqueueJob('bulk_operation', {
      accountId,
      userId,
      action,
      messageIds,
      query,
      labelId,
    }, { delay: delayMs })
    const runAt = new Date(Date.now() + delayMs).toISOString()

    // Query mode: the worker audits the real processed count once it is known
    if (messageIds) await logAudit(userId, `bulk.${action === 'trash' ? 'trash' : action === 'archive' ? 'archive' : 'label'}` as any, {
      targetType: 'messages', targetId: accountId,
      details: { action, count: messageIds.length, jobId: job.id },
    })

    return reply.code(202).send({ jobId: job.id, runAt, message: 'Job enqueued' })
  })

  // ─── Labels ───────────────────────────────────────────
  app.get('/:accountId/labels', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return listLabels(accountId)
  })

  app.post('/:accountId/labels', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { name } = labelNameSchema.parse(request.body)
    const label = await createLabel(accountId, name)
    await upsertLabels(accountId, [label])
    return reply.code(201).send(label)
  })

  app.patch('/:accountId/labels/:labelId', accountAuth, async (request) => {
    const { accountId, labelId } = request.params as { accountId: string; labelId: string }
    const patch = labelPatchSchema.parse(request.body)
    // Gmail rejects colors outside its fixed palette itself
    const label = await updateLabel(accountId, labelId, patch)
    await upsertLabels(accountId, [label])
    return label
  })

  app.delete('/:accountId/labels/:labelId', accountAuth, async (request, reply) => {
    const { accountId, labelId } = request.params as { accountId: string; labelId: string }
    await deleteLabel(accountId, labelId)
    await markLabelsDeleted(accountId, { only: labelId })
    return reply.code(204).send()
  })
}
