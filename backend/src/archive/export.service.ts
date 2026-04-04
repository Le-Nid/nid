import archiver from 'archiver'
import fs from 'fs'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('export')

export async function streamArchiveZip(
  accountId: string,
  mailIds: string[],
  outputStream: NodeJS.WritableStream
): Promise<{ mailCount: number; attachmentCount: number }> {
  logger.info({ accountId, mailCount: mailIds.length }, 'starting archive ZIP export')
  const db = getDb()

  const mails = await db
    .selectFrom('archived_mails as am')
    .leftJoin('archived_attachments as aa', 'aa.archived_mail_id', 'am.id')
    .select([
      'am.id',
      'am.gmail_message_id',
      'am.subject',
      'am.date',
      'am.eml_path',
      'aa.id as att_id',
      'aa.filename as att_filename',
      'aa.file_path as att_file_path',
    ])
    .where('am.gmail_account_id', '=', accountId)
    .where('am.id', 'in', mailIds)
    .execute()

  // Regrouper les PJ par mail
  const mailMap = new Map<string, {
    gmail_message_id: string
    subject: string | null
    date: Date | null
    eml_path: string
    attachments: { filename: string; file_path: string }[]
  }>()

  for (const row of mails) {
    if (!mailMap.has(row.id)) {
      mailMap.set(row.id, {
        gmail_message_id: row.gmail_message_id,
        subject:          row.subject,
        date:             row.date as unknown as Date | null,
        eml_path:         row.eml_path,
        attachments:      [],
      })
    }
    if (row.att_id && row.att_filename && row.att_file_path) {
      mailMap.get(row.id)!.attachments.push({
        filename:  row.att_filename,
        file_path: row.att_file_path,
      })
    }
  }

  const zip = archiver('zip', { zlib: { level: 6 } })
  zip.pipe(outputStream)

  let attachmentCount = 0

  for (const mail of mailMap.values()) {
    const date  = mail.date ? new Date(mail.date) : new Date()
    const year  = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const safeSubject = (mail.subject ?? 'no-subject')
      .replace(/[^a-zA-Z0-9\-_. ]/g, '_')
      .slice(0, 60)

    const folder = `${year}-${month}/${mail.gmail_message_id}_${safeSubject}`

    if (fs.existsSync(mail.eml_path)) {
      zip.file(mail.eml_path, { name: `${folder}/${safeSubject}.eml` })
    }

    for (const att of mail.attachments) {
      if (att.file_path && fs.existsSync(att.file_path)) {
        const safeName = att.filename.replace(/[^a-zA-Z0-9\-_. ]/g, '_')
        zip.file(att.file_path, { name: `${folder}/attachments/${safeName}` })
        attachmentCount++
      }
    }
  }

  await zip.finalize()
  return { mailCount: mailMap.size, attachmentCount }
}
