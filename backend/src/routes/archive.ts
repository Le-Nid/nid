import { FastifyInstance } from 'fastify'
import { getDb } from '../plugins/db'
import { enqueueJob } from '../jobs/queue'
import fs from 'fs'
import path from 'path'

export async function archiveRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }
  const db = getDb()

  // List archived mails
  app.get('/:accountId/mails', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { q, sender, from_date, to_date, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let mails
    if (q) {
      mails = await db`
        SELECT *, ts_rank(search_vector, query) AS rank
        FROM archived_mails, to_tsquery('french', ${q.split(' ').join(' & ')}) query
        WHERE gmail_account_id = ${accountId}
          AND search_vector @@ query
        ORDER BY rank DESC, date DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `
    } else {
      mails = await db`
        SELECT * FROM archived_mails
        WHERE gmail_account_id = ${accountId}
          ${sender ? db`AND sender ILIKE ${'%' + sender + '%'}` : db``}
          ${from_date ? db`AND date >= ${from_date}` : db``}
          ${to_date ? db`AND date <= ${to_date}` : db``}
        ORDER BY date DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `
    }

    const [{ count }] = await db`SELECT COUNT(*) FROM archived_mails WHERE gmail_account_id = ${accountId}`
    return { mails, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) }
  })

  // Get single archived mail with attachments
  app.get('/:accountId/mails/:mailId', auth, async (request, reply) => {
    const { accountId, mailId } = request.params as { accountId: string; mailId: string }
    const [mail] = await db`
      SELECT * FROM archived_mails WHERE id = ${mailId} AND gmail_account_id = ${accountId}
    `
    if (!mail) return reply.code(404).send({ error: 'Not found' })

    const attachments = await db`
      SELECT * FROM archived_attachments WHERE archived_mail_id = ${mailId}
    `
    const emlContent = fs.readFileSync(mail.eml_path, 'utf-8')
    return { ...mail, emlContent, attachments }
  })

  // Download attachment
  app.get('/:accountId/attachments/:attachmentId/download', auth, async (request, reply) => {
    const { attachmentId } = request.params as { attachmentId: string }
    const [att] = await db`SELECT * FROM archived_attachments WHERE id = ${attachmentId}`
    if (!att) return reply.code(404).send({ error: 'Not found' })

    return reply
      .header('Content-Disposition', `attachment; filename="${att.filename}"`)
      .header('Content-Type', att.mime_type)
      .send(fs.createReadStream(att.file_path))
  })

  // Trigger archive job
  app.post('/:accountId/archive', auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { messageIds, query, differential = true } = request.body as {
      messageIds?: string[]
      query?: string
      differential?: boolean
    }

    const job = await enqueueJob('archive_mails', { accountId, messageIds, query, differential })
    return reply.code(202).send({ jobId: job.id })
  })
}
