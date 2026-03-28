import fs from 'fs/promises'
import path from 'path'
import { getDb } from '../plugins/db'
import { getGmailClient } from '../gmail/gmail.service'
import { config } from '../config'

export async function archiveMail(accountId: string, messageId: string): Promise<void> {
  const db = getDb()

  // Skip if already archived
  const [existing] = await db`
    SELECT id FROM archived_mails
    WHERE gmail_account_id = ${accountId} AND gmail_message_id = ${messageId}
  `
  if (existing) return

  const gmail = await getGmailClient(accountId)
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'raw', // Base64url encoded raw RFC 2822 email
  })

  const msg = res.data
  if (!msg.raw) throw new Error(`Empty raw for message ${messageId}`)

  // Decode raw EML
  const rawEml = Buffer.from(msg.raw, 'base64url').toString('utf-8')

  // Parse date for folder structure
  const headers = msg.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

  const date = new Date(get('Date') || Date.now())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  // Build paths
  const mailDir = path.join(config.ARCHIVE_PATH, accountId, String(year), month)
  const emlPath = path.join(mailDir, `${messageId}.eml`)
  const attachDir = path.join(mailDir, `${messageId}_attachments`)

  await fs.mkdir(mailDir, { recursive: true })
  await fs.writeFile(emlPath, rawEml, 'utf-8')

  // Extract and save attachments
  const attachments = await extractAttachments(gmail, accountId, messageId, msg, attachDir)

  // Persist to DB
  const sender = get('From')
  const subject = get('Subject')
  const labelIds = msg.labelIds ?? []
  const sizeBytes = msg.sizeEstimate ?? 0
  const snippet = msg.snippet ?? ''
  const hasAttachments = attachments.length > 0

  const [archived] = await db`
    INSERT INTO archived_mails (
      gmail_account_id, gmail_message_id, thread_id,
      subject, sender, recipient,
      date, size_bytes, has_attachments,
      label_ids, eml_path, snippet
    ) VALUES (
      ${accountId}, ${messageId}, ${msg.threadId ?? ''},
      ${subject}, ${sender}, ${get('To')},
      ${date.toISOString()}, ${sizeBytes}, ${hasAttachments},
      ${labelIds}, ${emlPath}, ${snippet}
    )
    RETURNING id
  `

  if (attachments.length > 0) {
    await db`
      INSERT INTO archived_attachments ${db(
        attachments.map((a) => ({
          archived_mail_id: archived.id,
          filename: a.filename,
          mime_type: a.mimeType,
          size_bytes: a.size,
          file_path: a.filePath,
        }))
      )}
    `
  }
}

async function extractAttachments(
  gmail: any,
  accountId: string,
  messageId: string,
  msg: any,
  attachDir: string
) {
  const results: { filename: string; mimeType: string; size: number; filePath: string }[] = []
  const parts = msg.payload?.parts ?? []

  for (const part of parts) {
    if (!part.filename || !part.body?.attachmentId) continue

    const attachRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: part.body.attachmentId,
    })

    const data = Buffer.from(attachRes.data.data, 'base64url')
    await fs.mkdir(attachDir, { recursive: true })

    const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = path.join(attachDir, safeName)
    await fs.writeFile(filePath, data)

    results.push({
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: data.length,
      filePath,
    })
  }

  return results
}

// Check which IDs are already archived (for diff)
export async function getArchivedIds(accountId: string): Promise<Set<string>> {
  const db = getDb()
  const rows = await db`
    SELECT gmail_message_id FROM archived_mails WHERE gmail_account_id = ${accountId}
  `
  return new Set(rows.map((r: any) => r.gmail_message_id))
}
