import archiver from 'archiver'
import fs from 'node:fs'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('export')

type ZipMail = {
  gmail_message_id: string
  subject: string | null
  date: Date | null
  eml_path: string
  attachments: { filename: string; file_path: string }[]
}
type ZipRow = {
  id: string; gmail_message_id: string; subject: string | null; date: unknown; eml_path: string
  att_id: string | null; att_filename: string | null; att_file_path: string | null
}

/** One entry per mail, its attachments gathered (the query returns one row per attachment). */
function groupByMail(rows: ZipRow[]): Map<string, ZipMail> {
  const mailMap = new Map<string, ZipMail>()
  for (const row of rows) {
    let mail = mailMap.get(row.id)
    if (!mail) {
      mail = { gmail_message_id: row.gmail_message_id, subject: row.subject, date: row.date as Date | null, eml_path: row.eml_path, attachments: [] }
      mailMap.set(row.id, mail)
    }
    if (row.att_id && row.att_filename && row.att_file_path) mail.attachments.push({ filename: row.att_filename, file_path: row.att_file_path })
  }
  return mailMap
}

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
    .where('am.account_id', '=', accountId)
    .where('am.id', 'in', mailIds)
    .execute()

  const mailMap = groupByMail(mails)

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
