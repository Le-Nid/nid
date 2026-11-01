import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { simpleParser, type ParsedMail } from 'mailparser'
import { bodyTextFromParsed } from './body-text'
import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { trackApiCall } from '../gmail/quota.service'
import { config } from '../config'
import { createLogger } from '../logger'
import { extractAttachmentText } from './attachment-text'

const logger = createLogger('archive')

/** Decode RFC 2047 encoded-words: =?charset?encoding?text?= */
function decodeMimeWords(str: string): string {
  return str.replaceAll(
    /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        let bytes: Buffer
        if (encoding.toUpperCase() === 'B') {
          bytes = Buffer.from(text, 'base64')
        } else {
          // Quoted-printable: _ → space, =XX → byte
          const decoded = text
            .replaceAll('_', ' ')
            .replaceAll(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
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
    .where('account_id', '=', accountId)
    .where('gmail_message_id', '=', messageId)
    .executeTakeFirst()

  if (existing) {
    logger.debug({ accountId, messageId }, 'mail already archived, skipping')
    return
  }

  logger.info({ accountId, messageId }, 'archiving mail')
  const gmail = await getGmailClient(accountId)
  const res   = await gmailRetry(() => gmail.users.messages.get({
    userId: 'me', id: messageId, format: 'raw',
  }))
  trackApiCall(accountId, 'messages.get').catch(() => {})

  const msg = res.data
  if (!msg.raw) throw new Error(`Empty raw for message ${messageId}`)

  // Keep the exact bytes on disk: a utf-8 round-trip corrupts latin1/8bit mails
  const rawBuf  = Buffer.from(msg.raw, 'base64url')
  const rawEml  = rawBuf.toString('utf-8')

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

  let date = new Date(get('Date'))
  if (Number.isNaN(date.getTime())) date = new Date(Number(msg.internalDate) || Date.now())
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  const mailDir  = path.join(config.ARCHIVE_PATH, accountId, String(year), month)
  const emlPath  = path.join(mailDir, `${messageId}.eml`)
  const attachDir = path.join(mailDir, `${messageId}_attachments`)

  await fs.mkdir(mailDir, { recursive: true })
  await fs.writeFile(emlPath, rawBuf)

  const parsed = await simpleParser(rawBuf)
  const attachments = await extractAttachments(parsed, attachDir, accountId)

  const attachmentNames = attachments.map((a) => a.filename).join(' ')

  const archived = await db
    .insertInto('archived_mails')
    .values({
      account_id: accountId,
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
      body_text:        bodyTextFromParsed(parsed),
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
          text_content:     a.textContent,
        }))
      )
      .execute()
  }

  logger.info({ accountId, messageId, attachments: attachments.length, emlPath }, 'mail archived successfully')
}

async function extractAttachments(
  parsed: ParsedMail,
  attachDir: string,
  accountId: string
): Promise<{ filename: string; mimeType: string; size: number; filePath: string; contentHash: string; textContent: string | null }[]> {
  const results: { filename: string; mimeType: string; size: number; filePath: string; contentHash: string; textContent: string | null }[] = []
  const db = getDb()

  const attachments = parsed.attachments ?? []

  for (const [i, att] of attachments.entries()) {
    if (!att.filename) continue

    const contentHash = createHash('sha256').update(att.content).digest('hex')

    // Chercher un fichier existant avec le même hash, dans ce compte uniquement (le chiffrement est par compte)
    const existing = await db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select(['archived_attachments.file_path', 'archived_attachments.text_content'])
      .where('archived_attachments.content_hash', '=', contentHash)
      .where('archived_mails.account_id', '=', accountId)
      .executeTakeFirst()

    let filePath: string
    if (existing) {
      // Réutiliser le fichier existant — pas d'écriture disque
      filePath = existing.file_path
    } else {
      await fs.mkdir(attachDir, { recursive: true })
      // Index prefix: two attachments may share a name (e.g. inline image.png)
      const safeName = `${i}_${att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      filePath = path.join(attachDir, safeName)
      await fs.writeFile(filePath, att.content)
    }

    const mimeType = att.contentType ?? 'application/octet-stream'
    results.push({
      filename: att.filename,
      mimeType,
      size:     att.size,
      filePath,
      contentHash,
      // Same bytes already archived: same text, no second extraction
      textContent: existing?.text_content ?? await extractAttachmentText(att.filename, mimeType, att.content), // NOSONAR: one attachment at a time
    })
  }
  return results
}

export async function getArchivedIds(accountId: string): Promise<Set<string>> {
  const db = getDb()
  const rows = await db
    .selectFrom('archived_mails')
    .select('gmail_message_id')
    .where('account_id', '=', accountId)
    .execute()
  return new Set(rows.map((r) => r.gmail_message_id))
}
