import { simpleParser, type ParsedMail } from 'mailparser'
import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { createLogger } from '../logger'

const logger = createLogger('body-text')

const MAX_BODY_CHARS = 100_000
const BACKFILL_BATCH = 200

/** Plain text of a parsed mail for full-text search (mailparser already derives `text` from HTML-only mails). */
export function bodyTextFromParsed(parsed: Pick<ParsedMail, 'text'>): string {
  return (parsed.text ?? '')
    // NUL is rejected by Postgres text; \x01/\x02 are the ts_headline markers
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BODY_CHARS)
}

/** Never throws: '' when the EML cannot be parsed. */
export async function extractBodyText(raw: Buffer): Promise<string> {
  try {
    return bodyTextFromParsed(await simpleParser(raw))
  } catch {
    return ''
  }
}

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

/** ts_headline output (markers \x01/\x02) → HTML where <mark> is the only tag. */
export function highlightToHtml(headline: string): string {
  return escapeHtml(headline).replaceAll('\u0001', '<mark>').replaceAll('\u0002', '</mark>')
}

export const HEADLINE_OPTIONS =
  'StartSel=\u0001,StopSel=\u0002,MaxFragments=2,MaxWords=30,MinWords=10,FragmentDelimiter=" … "'

/** Rows the backfill must fill. Encrypted archives keep body_text NULL: never store their plaintext. */
function pendingRows() {
  return getDb()
    .selectFrom('archived_mails')
    .where('body_text', 'is', null)
    .where('is_encrypted', '=', false)
}

export async function countPendingBodyText(): Promise<number> {
  const { count } = await pendingRows()
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()
  return Number(count)
}

/**
 * Fill body_text for every archived mail (trash included: it can be restored) in batches.
 * A missing or unparsable EML gets '' so it is never picked again: the loop always ends.
 */
export async function backfillBodyText(onProgress?: (done: number) => Promise<void>): Promise<number> {
  const db = getDb()
  const storage = getLocalStorage()
  let done = 0
  for (;;) {
    const rows = await pendingRows().select(['id', 'eml_path']).orderBy('id').limit(BACKFILL_BATCH).execute()
    if (rows.length === 0) return done
    for (const row of rows) {
      const raw = await storage.readFile(row.eml_path).catch((err) => {
        logger.warn({ err, emlPath: row.eml_path }, 'EML unreadable, body_text left empty')
        return null
      })
      const bodyText = raw ? await extractBodyText(raw) : ''
      await db
        .updateTable('archived_mails')
        .set({ body_text: bodyText })
        .where('id', '=', row.id)
        // the mail may have been encrypted meanwhile
        .where('is_encrypted', '=', false)
        .execute()
    }
    done += rows.length
    await onProgress?.(done)
  }
}
