import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { trackApiCall } from '../gmail/quota.service'
import { config } from '../config'
import { escapeIlike } from '../utils/db'
import { extractPagination } from '../utils/pagination'
import { authPresets } from '../utils/auth'
import { backfillAttachmentHashes, getDeduplicationStats } from '../archive/dedup.service'
import fs from 'node:fs'

/** Sanitize filename for Content-Disposition header */
function sanitizeFilename(name: string): string {
  return name.replaceAll(/["\r\n]/g, '_')
}

// Only these render inline: SVG/HTML/XML can carry scripts that would run on the app origin
const INLINE_SAFE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
// No CSP on PDFs: `sandbox` blocks Chromium's built-in PDF viewer
const IMAGE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"

/** Headers for serving an attachment; inline only for the safe list, else forced download */
function fileHeaders(mimeType: string, filename: string, inlineRequested: boolean): Record<string, string> {
  const baseType = mimeType.split(';')[0].trim().toLowerCase()
  const inline = inlineRequested && INLINE_SAFE_MIME.has(baseType)
  const headers: Record<string, string> = {
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${sanitizeFilename(filename)}"`,
    'Content-Type': mimeType,
    'X-Content-Type-Options': 'nosniff',
  }
  if (inline && baseType.startsWith('image/')) headers['Content-Security-Policy'] = IMAGE_CSP
  return headers
}

/** Recursively find a part by filename in a Gmail message payload */
function findPartByFilename(parts: any[], filename: string): any {
  for (const part of parts) {
    if (part.filename === filename) return part
    if (part.parts) {
      const found = findPartByFilename(part.parts, filename)
      if (found) return found
    }
  }
  return null
}

export async function attachmentsRoutes(app: FastifyInstance) {
  const { accountAuth, auth } = authPresets(app)

  // ─── List archived attachments (from DB) ──────────────
  app.get('/:accountId/archived', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { sort = 'size', order = 'desc', q, page: pageStr, limit: limitStr } = request.query as Record<string, string>

    const db = getDb()
    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr })

    let query = db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select([
        'archived_attachments.id',
        'archived_attachments.filename',
        'archived_attachments.mime_type',
        'archived_attachments.size_bytes',
        'archived_attachments.file_path',
        'archived_mails.subject as mail_subject',
        'archived_mails.sender as mail_sender',
        'archived_mails.date as mail_date',
        'archived_mails.gmail_message_id',
        'archived_mails.id as archived_mail_id',
      ])
      .where('archived_mails.account_id', '=', accountId)

    if (q) {
      query = query.where((eb: any) =>
        eb.or([
          eb('archived_attachments.filename', 'ilike', `%${escapeIlike(q)}%`),
          eb('archived_mails.subject', 'ilike', `%${escapeIlike(q)}%`),
          eb('archived_mails.sender', 'ilike', `%${escapeIlike(q)}%`),
        ])
      )
    }

    const sortCol = sort === 'date' ? 'archived_mails.date' as any : 'archived_attachments.size_bytes' as any
    const sortDir = order === 'asc' ? 'asc' as const : 'desc' as const

    const attachments = await query
      .orderBy(sortCol, sortDir)
      .limit(lim)
      .offset(offset)
      .execute()

    let countQuery = db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select((eb: any) => eb.fn.countAll().as('count'))
      .where('archived_mails.account_id', '=', accountId)

    if (q) {
      countQuery = countQuery.where((eb: any) =>
        eb.or([
          eb('archived_attachments.filename', 'ilike', `%${escapeIlike(q)}%`),
          eb('archived_mails.subject', 'ilike', `%${escapeIlike(q)}%`),
          eb('archived_mails.sender', 'ilike', `%${escapeIlike(q)}%`),
        ])
      )
    }

    const { count } = await countQuery.executeTakeFirstOrThrow() as any

    // Compute total size
    const sizeQuery = db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select((eb: any) => eb.fn.sum('archived_attachments.size_bytes').as('total_size'))
      .where('archived_mails.account_id', '=', accountId)

    const { total_size } = await sizeQuery.executeTakeFirstOrThrow() as any

    return {
      attachments,
      total: Number(count),
      totalSizeBytes: Number(total_size ?? 0),
      page,
      limit: lim,
    }
  })

  // ─── Scan live Gmail attachments (direct API call) ────
  app.get('/:accountId/live', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { maxResults = '200' } = request.query as { maxResults?: string }

    const gmail = await getGmailClient(accountId)

    // Search for messages with attachments, ordered by size
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment larger:100k',
      maxResults: Math.min(Number.parseInt(maxResults), 500),
    })
    trackApiCall(accountId, 'messages.list').catch(() => {})

    const messageIds = (listRes.data.messages ?? []).map((m) => m.id!)
    if (messageIds.length === 0) return { attachments: [], totalSizeBytes: 0 }

    const results: any[] = []

    const fetchMessageMeta = async (id: string) => {
      const r = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] })
      trackApiCall(accountId, 'messages.get').catch(() => {})
      return r.data
    }

    for (let i = 0; i < messageIds.length; i += config.GMAIL_BATCH_SIZE) {
      const chunk = messageIds.slice(i, i + config.GMAIL_BATCH_SIZE)

      const fetched = await Promise.all(chunk.map((id) => fetchMessageMeta(id)))

      for (const msg of fetched) {
        const headers = msg.payload?.headers ?? []
        const getH = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        const parts = msg.payload?.parts ?? []
        for (const part of parts) {
          if (!part.filename || part.filename.length === 0) continue
          results.push({
            messageId: msg.id,
            filename: part.filename,
            mimeType: part.mimeType ?? 'application/octet-stream',
            sizeBytes: part.body?.size ?? 0,
            mailSubject: getH('Subject'),
            mailSender: getH('From'),
            mailDate: getH('Date'),
            mailSizeEstimate: msg.sizeEstimate ?? 0,
          })
        }
      }

      if (i + config.GMAIL_BATCH_SIZE < messageIds.length) {
        await sleep(config.GMAIL_THROTTLE_MS)
      }
    }

    // Sort by size descending
    results.sort((a, b) => b.sizeBytes - a.sizeBytes)
    const totalSizeBytes = results.reduce((s, a) => s + a.sizeBytes, 0)

    return { attachments: results, totalSizeBytes }
  })

  // ─── Deduplication stats ──────────────────────────────
  app.get('/dedup-stats', auth, async (request) => {
    return getDeduplicationStats(request.user.sub)
  })

  // ─── Download archived attachment ─────────────────────
  app.get('/:accountId/archived/:attachmentId/download', accountAuth, async (request, reply) => {
    const { accountId, attachmentId } = request.params as { accountId: string; attachmentId: string }
    const { inline: inlineParam } = request.query as { inline?: string }

    const db = getDb()
    // accountAuth only checks accountId: the attachment must also belong to it
    const att = await db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .selectAll('archived_attachments')
      .where('archived_attachments.id', '=', attachmentId)
      .where('archived_mails.account_id', '=', accountId)
      .executeTakeFirst()

    if (!att) return reply.code(404).send({ error: 'Attachment not found' })

    if (!fs.existsSync(att.file_path)) {
      return reply.code(404).send({ error: 'File not found on disk' })
    }

    return reply
      .headers(fileHeaders(att.mime_type ?? 'application/octet-stream', att.filename, inlineParam === '1'))
      .send(fs.createReadStream(att.file_path))
  })

  // ─── Download live Gmail attachment ───────────────────
  app.get('/:accountId/live/:messageId/download', accountAuth, async (request, reply) => {
    const { accountId, messageId } = request.params as { accountId: string; messageId: string }
    const { filename, inline: inlineParam } = request.query as { filename?: string; inline?: string }

    if (!filename) return reply.code(400).send({ error: 'filename query parameter required' })

    const gmail = await getGmailClient(accountId)

    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })
    trackApiCall(accountId, 'messages.get').catch(() => {})

    const parts = msg.data.payload?.parts ?? []
    const part = findPartByFilename(parts, filename)

    if (!part) return reply.code(404).send({ error: 'Attachment not found in message' })

    let data: Buffer

    if (part.body?.data) {
      data = Buffer.from(part.body.data, 'base64url')
    } else if (part.body?.attachmentId) {
      const attRes = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: part.body.attachmentId,
      })
      trackApiCall(accountId, 'messages.get').catch(() => {})
      data = Buffer.from(attRes.data.data!, 'base64url')
    } else {
      return reply.code(404).send({ error: 'No attachment data available' })
    }

    const mimeType = part.mimeType ?? 'application/octet-stream'
    return reply
      .headers(fileHeaders(mimeType, filename, inlineParam === '1'))
      .send(data)
  })

  // ─── Backfill hashes for existing attachments ─────────
  app.post('/dedup-backfill', auth, async (request) => {
    return backfillAttachmentHashes(request.user.sub)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
