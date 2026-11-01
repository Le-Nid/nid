import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { simpleParser } from 'mailparser'
import { getDb } from '../db'
import { getLocalStorage, type StorageBackend } from '../storage/storage.service'
import { config } from '../config'
import { createLogger } from '../logger'
import { resolveImportedLabelIds } from '../labels/labels.service'
import { bodyTextFromParsed } from './body-text'
import { extractAttachments } from './archive.service'

const logger = createLogger('import')

// ─── Mbox parser ────────────────────────────────────────────

/**
 * Parse an mbox file into individual EML strings.
 * Mbox format: messages separated by lines starting with "From " at BOL.
 */
export function parseMbox(content: string): string[] {
  const messages: string[] = []
  const lines = content.split(/\r?\n/)
  let current: string[] = []

  for (const line of lines) {
    if (line.startsWith('From ') && current.length > 0) {
      messages.push(current.join('\n'))
      current = []
    } else {
      // Unescape mbox quoting: ">From " → "From "
      current.push(line.startsWith('>From ') ? line.slice(1) : line)
    }
  }

  if (current.length > 0) {
    const msg = current.join('\n').trim()
    if (msg) messages.push(msg)
  }

  return messages
}

/**
 * Decode RFC 2047 encoded words (`=?UTF-8?Q?Cat=C3=A9gorie?=`): mailparser only decodes
 * well-known headers, not `X-Gmail-Labels`.
 */
export function decodeMimeWords(value: string): string {
  return value
    .replaceAll(/\?=\s+=\?/g, '?==?') // whitespace between adjacent encoded words is not part of the text
    .replaceAll(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (word, charset: string, enc: string, text: string) => {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : Buffer.from(text.replaceAll('_', ' ').replaceAll(/=([0-9A-Fa-f]{2})/g, (_h, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))), 'latin1')
      try {
        return new TextDecoder(charset).decode(bytes)
      } catch {
        return word // unknown charset: keep the raw word rather than failing the whole message
      }
    })
}

/**
 * Import an mbox file into archives.
 */
export async function importMbox(
  userId: string,
  accountId: string,
  filePath: string,
  opts?: { onProgress?: (done: number, total: number) => Promise<void> },
): Promise<{ imported: number; skipped: number; errors: number }> {
  // latin1 maps each byte to one char, so Buffer.from(msg, 'latin1') gives back the exact bytes
  const content = await fs.readFile(filePath, 'latin1')
  const rawMessages = parseMbox(content).map((m) => Buffer.from(m, 'latin1'))
  const total = rawMessages.length
  let imported = 0
  let skipped = 0
  let errors = 0

  const db = getDb()
  const storage = getLocalStorage()

  for (let i = 0; i < rawMessages.length; i++) {
    try {
      const result = await importSingleEml(db, storage, accountId, rawMessages[i])
      if (result === 'imported') imported++
      else skipped++
    } catch (err) {
      errors++
      logger.error(`[import-mbox] Failed to import message ${i + 1}/${total}: ${(err as Error).message}`)
    }

    if (opts?.onProgress && (i + 1) % 10 === 0) {
      await opts.onProgress(i + 1, total)
    }
  }

  if (opts?.onProgress) {
    await opts.onProgress(total, total)
  }

  return { imported, skipped, errors }
}

/** Starts with a header field (RFC 5322 `name:`): anything else uploaded as .eml would be archived as an empty mail. */
export function looksLikeEml(raw: Buffer): boolean {
  return /^[\x21-\x39\x3b-\x7e]+:/.test(raw.subarray(0, 1000).toString('latin1'))
}

/**
 * Import a single EML string into the archive; `folderLabels` (IMAP folder) join the Takeout labels.
 */
export async function importSingleEml(
  db: ReturnType<typeof getDb>,
  storage: StorageBackend,
  accountId: string,
  rawEml: Buffer,
  folderLabels: string[] = [],
): Promise<'imported' | 'skipped'> {
  const parsed = await simpleParser(rawEml)

  const messageId = parsed.messageId?.replace(/[<>]/g, '') ?? `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Check for duplicates
  const existing = await db
    .selectFrom('archived_mails')
    .select('id')
    .where('account_id', '=', accountId)
    .where('gmail_message_id', '=', messageId)
    .executeTakeFirst()

  if (existing) return 'skipped'

  const date = parsed.date ?? new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  const mailDir = path.join(config.ARCHIVE_PATH, accountId, String(year), month)
  const safeId = messageId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const emlPath = path.join(mailDir, `${safeId}.eml`)
  const attachDir = path.join(mailDir, `${safeId}_attachments`)

  await storage.mkdir(mailDir)
  await storage.writeFile(emlPath, rawEml)

  // Extract and save attachments
  // Same as a Gmail backup: a file already archived in this account (same SHA-256) is not written again
  const attachments = await extractAttachments(parsed, attachDir, accountId)

  const attachmentNames = attachments.map((a) => a.filename).join(' ')
  // Takeout mbox: `X-Gmail-Labels: Inbox,Category Promotions,Factures`
  const labelHeader = parsed.headers.get('x-gmail-labels')
  const labelNames = [...new Set([
    ...(typeof labelHeader === 'string' ? decodeMimeWords(labelHeader).split(',').map((n) => n.trim()).filter(Boolean) : []),
    ...folderLabels,
  ])]

  const archived = await db
    .insertInto('archived_mails')
    .values({
      account_id: accountId,
      gmail_message_id: messageId,
      thread_id: null,
      in_reply_to: parsed.inReplyTo ?? null,
      references_header: Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references ?? null),
      subject: parsed.subject ?? null,
      sender: parsed.from?.text ?? null,
      recipient: Array.isArray(parsed.to) ? parsed.to[0]?.text ?? null : parsed.to?.text ?? null,
      date,
      size_bytes: BigInt(Buffer.byteLength(rawEml)),
      has_attachments: attachments.length > 0,
      label_ids: await resolveImportedLabelIds(accountId, labelNames),
      eml_path: emlPath,
      snippet: parsed.text?.slice(0, 200) ?? null,
      attachment_names: attachmentNames || null,
      body_text: bodyTextFromParsed(parsed),
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  if (attachments.length > 0) {
    await db
      .insertInto('archived_attachments')
      .values(
        attachments.map((a) => ({
          archived_mail_id: archived.id,
          filename: a.filename,
          mime_type: a.mimeType,
          size_bytes: BigInt(a.size),
          file_path: a.filePath,
          content_hash: a.contentHash,
          text_content: a.textContent,
        })),
      )
      .execute()
  }

  return 'imported'
}

/**
 * Import from IMAP server into archives.
 */
export async function importImap(
  userId: string,
  accountId: string,
  imapConfig: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    folder?: string
    maxMessages?: number
  },
  opts?: { onProgress?: (done: number, total: number) => Promise<void> },
): Promise<{ imported: number; skipped: number; errors: number }> {
  // Dynamic import for ESM compatibility
  const { ImapFlow } = await import('imapflow')

  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.secure,
    auth: {
      user: imapConfig.user,
      pass: imapConfig.pass,
    },
    logger: false,
  })

  let imported = 0
  let skipped = 0
  let errors = 0

  try {
    await client.connect()
    const folder = imapConfig.folder ?? 'INBOX'
    const lock = await client.getMailboxLock(folder)

    try {
      const status = await client.status(folder, { messages: true })
      const total = Math.min(status.messages ?? 0, imapConfig.maxMessages ?? Infinity)

      const db = getDb()
      const storage = getLocalStorage()
      let processed = 0

      // Fetch messages (newest first)
      const range = imapConfig.maxMessages ? `1:${imapConfig.maxMessages}` : '1:*'
      for await (const msg of client.fetch(range, { source: true })) {
        try {
          const rawEml = msg.source
          if (!rawEml) { skipped++; continue }
          const result = await importSingleEml(db, storage, accountId, rawEml)
          if (result === 'imported') imported++
          else skipped++
        } catch (err) {
          errors++
          logger.error(`[import-imap] Failed to import message: ${(err as Error).message}`)
        }
        processed++

        if (opts?.onProgress && processed % 10 === 0) {
          await opts.onProgress(processed, total)
        }
      }

      if (opts?.onProgress) {
        await opts.onProgress(total, total)
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return { imported, skipped, errors }
}

/**
 * Export archives to mbox format.
 */
export async function exportMbox(
  userId: string,
  accountId: string,
  mailIds?: string[],
): Promise<Readable> {
  const db = getDb()
  const storage = getLocalStorage()

  let query = db
    .selectFrom('archived_mails')
    .select(['id', 'eml_path', 'sender', 'date'])
    .where('account_id', '=', accountId)
    .orderBy('date', 'asc')

  if (mailIds?.length) {
    query = query.where('id', 'in', mailIds)
  }

  const mails = await query.execute()

  // Create a readable stream for the mbox output
  const chunks: string[] = []

  for (const mail of mails) {
    try {
      const eml = await storage.readFileUtf8(mail.eml_path)
      const sender = /<([^<>]+)>/.exec(mail.sender ?? '')?.[1] ?? mail.sender ?? 'unknown@unknown'
      const date = mail.date ? new Date(mail.date).toUTCString() : new Date().toUTCString()

      // Mbox separator line
      chunks.push(`From ${sender} ${date}\n`)

      // Escape "From " at start of lines inside the message body
      const escapedEml = eml.replace(/^(From )/gm, '>$1')
      chunks.push(escapedEml)

      // Blank line between messages
      if (!escapedEml.endsWith('\n')) chunks.push('\n')
      chunks.push('\n')
    } catch (err) {
      logger.error(`[export-mbox] Failed to read mail ${mail.id}: ${(err as Error).message}`)
    }
  }

  return Readable.from(chunks.join(''))
}
