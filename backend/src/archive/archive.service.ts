import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { simpleParser } from 'mailparser'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { config } from '../config'

/** Decode RFC 2047 encoded-words: =?charset?encoding?text?= */
function decodeMimeWords(str: string): string {
  return str.replaceAll(
    /=\?([^?]+)\?(B|Q)\?([^?]*)\?=/gi,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        let bytes: Buffer
        if (encoding.toUpperCase() === 'B') {
          bytes = Buffer.from(text, 'base64')
        } else {
          // Quoted-printable: _ → space, =XX → byte
          const decoded = text
            .replaceAll('_', ' ')
            .replaceAll(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
          bytes = Buffer.from(decoded, 'binary')
        }
        return new TextDecoder(charset).decode(bytes)
      } catch {
        return text
      }
    },
  )
}

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

  // Parse headers from raw EML (format: 'raw' doesn't populate payload.headers)
  const headerSection = rawEml.split(/\r?\n\r?\n/)[0] ?? ''
  // Unfold continuation lines (lines starting with whitespace are continuations)
  const unfolded = headerSection.replace(/\r?\n[ \t]+/g, ' ')
  const headerLines = unfolded.split(/\r?\n/)
  const parsedHeaders = new Map<string, string>()
  for (const line of headerLines) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim().toLowerCase()
      const val = line.slice(idx + 1).trim()
      if (!parsedHeaders.has(key)) parsedHeaders.set(key, val)
    }
  }
  const get = (name: string) => decodeMimeWords(parsedHeaders.get(name.toLowerCase()) ?? '')

  const date  = new Date(get('Date') || Date.now())
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  const mailDir  = path.join(config.ARCHIVE_PATH, accountId, String(year), month)
  const emlPath  = path.join(mailDir, `${messageId}.eml`)
  const attachDir = path.join(mailDir, `${messageId}_attachments`)

  await fs.mkdir(mailDir, { recursive: true })
  await fs.writeFile(emlPath, rawEml, 'utf-8')

  const attachments = await extractAttachments(rawEml, attachDir)

  const attachmentNames = attachments.map((a) => a.filename).join(' ')

  const archived = await db
    .insertInto('archived_mails')
    .values({
      gmail_account_id: accountId,
      gmail_message_id: messageId,
      thread_id:        msg.threadId ?? null,
      in_reply_to:      get('In-Reply-To') || null,
      references_header: get('References') || null,
      subject:          get('Subject') || null,
      sender:           get('From') || null,
      recipient:        get('To') || null,
      date:             date,
      size_bytes:       BigInt(msg.sizeEstimate ?? 0),
      has_attachments:  attachments.length > 0,
      label_ids:        msg.labelIds ?? [],
      eml_path:         emlPath,
      snippet:          msg.snippet ?? null,
      attachment_names: attachmentNames || null,
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
          content_hash:     a.contentHash,
        }))
      )
      .execute()
  }
}

async function extractAttachments(
  rawEml: string,
  attachDir: string
): Promise<{ filename: string; mimeType: string; size: number; filePath: string; contentHash: string }[]> {
  const results: { filename: string; mimeType: string; size: number; filePath: string; contentHash: string }[] = []
  const db = getDb()

  const parsed = await simpleParser(rawEml)
  const attachments = parsed.attachments ?? []

  for (const att of attachments) {
    if (!att.filename) continue

    const contentHash = createHash('sha256').update(att.content).digest('hex')

    // Chercher un fichier existant avec le même hash pour déduplication
    const existing = await db
      .selectFrom('archived_attachments')
      .select('file_path')
      .where('content_hash', '=', contentHash)
      .executeTakeFirst()

    let filePath: string
    if (existing) {
      // Réutiliser le fichier existant — pas d'écriture disque
      filePath = existing.file_path
    } else {
      await fs.mkdir(attachDir, { recursive: true })
      const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = path.join(attachDir, safeName)
      await fs.writeFile(filePath, att.content)
    }

    results.push({
      filename: att.filename,
      mimeType: att.contentType ?? 'application/octet-stream',
      size:     att.size,
      filePath,
      contentHash,
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
