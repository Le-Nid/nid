import { sql, type RawBuilder } from 'kysely'
import { unzipSync, strFromU8 } from 'fflate'
import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { createLogger } from '../logger'
import { FTS_CONFIG } from '../utils/db'
import { HEADLINE_OPTIONS, highlightToHtml } from './body-text'

const logger = createLogger('attachment-text')

// Bounds: a huge or hostile file costs at most this much, and never fails the archiving
const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_PAGES = 100
const MAX_CHARS = 50_000
const TIME_LIMIT_MS = 10_000
const BACKFILL_BATCH = 50

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type Kind = 'pdf' | 'docx'

/** PDF or DOCX, by MIME type or extension (mail clients often send `application/octet-stream`). */
export function textKind(filename: string, mimeType: string | null): Kind | null {
  const name = filename.toLowerCase()
  if (mimeType === PDF_MIME || name.endsWith('.pdf')) return 'pdf'
  if (mimeType === DOCX_MIME || name.endsWith('.docx')) return 'docx'
  return null
}

/** Same rule as textKind, in SQL, for the backfill. */
const extractable = () => sql<boolean>`(mime_type IN (${PDF_MIME}, ${DOCX_MIME}) OR lower(filename) LIKE '%.pdf' OR lower(filename) LIKE '%.docx')`

const clean = (text: string) => text
  // NUL is rejected by Postgres text; \x01/\x02 are the ts_headline markers
  .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_CHARS)

async function pdfText(content: Uint8Array, deadline: number): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(content, { verbosity: 0 })
  try {
    let text = ''
    // Page by page: the size and time bounds are checked between pages
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES) && text.length < MAX_CHARS && Date.now() < deadline; i++) {
      const page = await pdf.getPage(i) // NOSONAR: pages one after the other, to stop at a bound
      const { items } = await page.getTextContent() // NOSONAR
      text += ' ' + items.map((it) => ('str' in it ? it.str : '')).join(' ')
    }
    return text
  } finally {
    await pdf.loadingTask.destroy()
  }
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** word/document.xml without its tags: paragraphs and tabs become spaces. */
export function docxXmlText(xml: string): string {
  return xml
    .replaceAll(/<\/w:p>|<w:tab\/>|<w:br\/>/g, ' ')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] !== '#') return XML_ENTITIES[e] ?? m
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
}

function docxText(content: Uint8Array): string {
  // Only word/document.xml is inflated, and not when it would be huge (zip bomb)
  const files = unzipSync(content, { filter: (f) => f.name === 'word/document.xml' && f.originalSize <= MAX_INPUT_BYTES })
  const xml = files['word/document.xml']
  return xml ? docxXmlText(strFromU8(xml)) : ''
}

/**
 * Searchable text of a PDF or DOCX attachment, '' when it has none or cannot be read; null for other types.
 * Never throws: an unreadable attachment must not fail the archiving.
 */
export async function extractAttachmentText(filename: string, mimeType: string | null, content: Uint8Array): Promise<string | null> {
  const kind = textKind(filename, mimeType)
  if (!kind) return null
  if (content.byteLength > MAX_INPUT_BYTES) return ''
  const deadline = Date.now() + TIME_LIMIT_MS
  let timer: NodeJS.Timeout | undefined
  try {
    // pdf.js copies the bytes it is given: the caller's buffer stays intact
    const work = kind === 'pdf' ? pdfText(new Uint8Array(content), deadline) : Promise.resolve(docxText(content))
    // shortcut: a single page that parses past the limit keeps the CPU until it ends; a worker thread would be needed to kill it
    const timeout = new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), TIME_LIMIT_MS) })
    return clean(await Promise.race([work, timeout]))
  } catch (err) {
    logger.warn({ err: (err as Error).message, filename }, 'Attachment text not extracted')
    return ''
  } finally {
    clearTimeout(timer)
  }
}

/** PDF/DOCX attachments archived before text extraction. Encrypted archives keep NULL: never store their plaintext. */
function pendingRows() {
  return getDb()
    .selectFrom('archived_attachments')
    .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
    .where('archived_attachments.text_content', 'is', null)
    .where('archived_mails.is_encrypted', '=', false)
    .where(extractable())
}

export async function countPendingAttachmentText(): Promise<number> {
  const { count } = await pendingRows()
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()
  return Number(count)
}

/** Fills text_content in batches; an unreadable file gets '' so it is never picked again and the loop ends. */
export async function backfillAttachmentText(onProgress?: (done: number) => Promise<void>): Promise<number> {
  const db = getDb()
  const storage = getLocalStorage()
  let done = 0
  for (;;) {
    const rows = await pendingRows()
      .select(['archived_attachments.id', 'archived_attachments.filename', 'archived_attachments.mime_type', 'archived_attachments.file_path'])
      .orderBy('archived_attachments.id').limit(BACKFILL_BATCH).execute()
    if (rows.length === 0) return done
    for (const row of rows) {
      const content = await storage.readFile(row.file_path).catch((err) => { // NOSONAR: one file at a time, bounded memory
        logger.warn({ err, filePath: row.file_path }, 'Attachment unreadable, text left empty')
        return null
      })
      const text = content ? await extractAttachmentText(row.filename, row.mime_type, content) : '' // NOSONAR
      await db.updateTable('archived_attachments').set({ text_content: text ?? '' }).where('id', '=', row.id).execute() // NOSONAR
    }
    done += rows.length
    await onProgress?.(done)
  }
}

/**
 * For search results: per mail, its first attachment (by name) whose text matches, with a highlighted excerpt.
 * Only the page's mails are looked at, so the tsvector is computed on the fly for a few attachments at most.
 */
export async function attachmentMatches(mailIds: string[], tsQuery: RawBuilder<unknown>): Promise<Map<string, { filename: string; highlight: string }>> {
  if (mailIds.length === 0) return new Map()
  const rows = await getDb().selectFrom('archived_attachments')
    .distinctOn('archived_mail_id')
    .select(['archived_mail_id', 'filename', sql<string>`ts_headline(${FTS_CONFIG}, text_content, ${tsQuery}, ${HEADLINE_OPTIONS})`.as('highlight')])
    .where('archived_mail_id', 'in', mailIds)
    .where('text_content', '<>', '')
    .where(sql<boolean>`to_tsvector(${FTS_CONFIG}, text_content) @@ ${tsQuery}`)
    .orderBy('archived_mail_id').orderBy('filename')
    .execute()
  return new Map(rows.map((r) => [r.archived_mail_id, { filename: r.filename, highlight: highlightToHtml(r.highlight) }]))
}
