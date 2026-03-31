import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { config } from '../config'

export async function archiveMail(accountId: string, messageId: string): Promise<void> {
  const db = getDb()

  // Skip si déjà archivé
  const existing = await db
    .selectFrom('archived_mails')
    .select('id')
    .where('gmail_account_id', '=', accountId)
    .where('gmail_message_id', '=', messageId)
    .executeTakeFirst()

  if (existing) return

  const gmail = await getGmailClient(accountId)
  const res   = await gmailRetry(() => gmail.users.messages.get({
    userId: 'me', id: messageId, format: 'raw',
  }))

  const msg = res.data
  if (!msg.raw) throw new Error(`Empty raw for message ${messageId}`)

  const rawEml  = Buffer.from(msg.raw, 'base64url').toString('utf-8')
  const headers = msg.payload?.headers ?? []
  const get     = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

  const date  = new Date(get('Date') || Date.now())
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  const mailDir  = path.join(config.ARCHIVE_PATH, accountId, String(year), month)
  const emlPath  = path.join(mailDir, `${messageId}.eml`)
  const attachDir = path.join(mailDir, `${messageId}_attachments`)

  await fs.mkdir(mailDir, { recursive: true })
  await fs.writeFile(emlPath, rawEml, 'utf-8')

  const attachments = await extractAttachments(gmail, messageId, msg, attachDir)

  const archived = await db
    .insertInto('archived_mails')
    .values({
      gmail_account_id: accountId,
      gmail_message_id: messageId,
      thread_id:        msg.threadId ?? null,
      subject:          get('Subject') || null,
      sender:           get('From') || null,
      recipient:        get('To') || null,
      date:             date,
      size_bytes:       BigInt(msg.sizeEstimate ?? 0),
      has_attachments:  attachments.length > 0,
      label_ids:        msg.labelIds ?? [],
      eml_path:         emlPath,
      snippet:          msg.snippet ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  if (attachments.length > 0) {
    await db
      .insertInto('archived_attachments')
      .values(
        attachments.map((a) => ({
          archived_mail_id: archived.id,
          filename:         a.filename,
          mime_type:        a.mimeType,
          size_bytes:       BigInt(a.size),
          file_path:        a.filePath,
        }))
      )
      .execute()
  }
}

async function extractAttachments(
  gmail: any,
  messageId: string,
  msg: any,
  attachDir: string
): Promise<{ filename: string; mimeType: string; size: number; filePath: string }[]> {
  const results: { filename: string; mimeType: string; size: number; filePath: string }[] = []
  const parts = msg.payload?.parts ?? []

  for (const part of parts) {
    if (!part.filename || !part.body?.attachmentId) continue

    const attachmentId = part.body.attachmentId
    const attachRes: any = await gmailRetry(() => gmail.users.messages.attachments.get({
      userId: 'me', messageId, id: attachmentId,
    }))
    const data = Buffer.from(attachRes.data.data, 'base64url')

    await fs.mkdir(attachDir, { recursive: true })
    const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = path.join(attachDir, safeName)
    await fs.writeFile(filePath, data)

    results.push({
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size:     data.length,
      filePath,
    })
  }
  return results
}

export async function getArchivedIds(accountId: string): Promise<Set<string>> {
  const db = getDb()
  const rows = await db
    .selectFrom('archived_mails')
    .select('gmail_message_id')
    .where('gmail_account_id', '=', accountId)
    .execute()
  return new Set(rows.map((r) => r.gmail_message_id))
}
