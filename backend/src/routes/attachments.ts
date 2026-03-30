import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { config } from '../config'

/** Escape ILIKE special characters (Point 10) */
function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&')
}

export async function attachmentsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate, app.requireAccountOwnership] }

  // ─── List archived attachments (from DB) ──────────────
  app.get('/:accountId/archived', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { page = '1', limit = '50', sort = 'size', order = 'desc', q } = request.query as Record<string, string>

    const db = getDb()
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const lim = parseInt(limit)

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
      .where('archived_mails.gmail_account_id', '=', accountId)

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
      .where('archived_mails.gmail_account_id', '=', accountId)

    if (q) {
      countQuery = countQuery.where((eb: any) =>
        eb.or([
          eb('archived_attachments.filename', 'ilike', `%${q}%`),
          eb('archived_mails.subject', 'ilike', `%${q}%`),
          eb('archived_mails.sender', 'ilike', `%${q}%`),
        ])
      )
    }

    const { count } = await countQuery.executeTakeFirstOrThrow() as any

    // Compute total size
    const sizeQuery = db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select((eb: any) => eb.fn.sum('archived_attachments.size_bytes').as('total_size'))
      .where('archived_mails.gmail_account_id', '=', accountId)

    const { total_size } = await sizeQuery.executeTakeFirstOrThrow() as any

    return {
      attachments,
      total: Number(count),
      totalSizeBytes: Number(total_size ?? 0),
      page: parseInt(page),
      limit: lim,
    }
  })

  // ─── Scan live Gmail attachments (direct API call) ────
  app.get('/:accountId/live', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { maxResults = '200' } = request.query as { maxResults?: string }

    const gmail = await getGmailClient(accountId)

    // Search for messages with attachments, ordered by size
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment larger:100k',
      maxResults: Math.min(parseInt(maxResults), 500),
    })

    const messageIds = (listRes.data.messages ?? []).map((m) => m.id!)
    if (messageIds.length === 0) return { attachments: [], totalSizeBytes: 0 }

    const results: any[] = []

    for (let i = 0; i < messageIds.length; i += config.GMAIL_BATCH_SIZE) {
      const chunk = messageIds.slice(i, i + config.GMAIL_BATCH_SIZE)

      const fetched = await Promise.all(
        chunk.map((id) =>
          gmail.users.messages
            .get({
              userId: 'me',
              id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date'],
            })
            .then((r) => r.data)
        )
      )

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
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
