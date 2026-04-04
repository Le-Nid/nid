import fs from 'fs/promises'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('pii-scanner')

// ─── PII detection patterns ──────────────────────────────
// All patterns are designed to minimize false positives

interface PiiPattern {
  type: string
  label: string
  regex: RegExp
  /** Mask the match for safe display */
  mask: (match: string) => string
}

const PII_PATTERNS: PiiPattern[] = [
  {
    type: 'credit_card',
    label: 'Numéro de carte bancaire',
    // Visa, Mastercard, Amex — with optional separators
    regex: /\b(?:4[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|5[1-5][0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}|3[47][0-9]{2}[-\s]?[0-9]{6}[-\s]?[0-9]{5})\b/g,
    mask: (m) => m.replace(/[0-9]/g, '*').slice(0, -4) + m.slice(-4),
  },
  {
    type: 'iban',
    label: 'IBAN',
    regex: /\b[A-Z]{2}[0-9]{2}[\s]?[A-Z0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,4}\b/gi,
    mask: (m) => m.slice(0, 4) + m.slice(4).replace(/[A-Z0-9]/gi, '*'),
  },
  {
    type: 'french_ssn',
    label: 'Numéro de sécurité sociale',
    // French SSN: 1 or 2 + 13 digits (with optional spaces/dots)
    regex: /\b[12][\s.-]?[0-9]{2}[\s.-]?(?:0[1-9]|1[0-2]|[2-9][0-9])[\s.-]?[0-9]{2,3}[\s.-]?[0-9]{3}[\s.-]?[0-9]{3}[\s.-]?[0-9]{2}\b/g,
    mask: (m) => m.slice(0, 3) + m.slice(3).replace(/[0-9]/g, '*'),
  },
  {
    type: 'password_plain',
    label: 'Mot de passe en clair',
    // Common password disclosure patterns in emails
    regex: /(?:mot de passe|password|mdp|pwd)\s*[:=]\s*["']?([^\s"'<]{4,64})["']?/gi,
    mask: () => '********',
  },
  {
    type: 'phone_fr',
    label: 'Numéro de téléphone FR',
    regex: /\b(?:(?:\+33|0033|0)\s?[1-9])(?:[\s.-]?[0-9]{2}){4}\b/g,
    mask: (m) => m.slice(0, -4) + '****',
  },
]

export interface PiiResult {
  piiType: string
  label: string
  count: number
  snippet: string
}

/**
 * Scan a text body for PII patterns.
 */
export function detectPii(text: string): PiiResult[] {
  const results: PiiResult[] = []

  for (const pattern of PII_PATTERNS) {
    const matches = text.match(pattern.regex)
    if (matches && matches.length > 0) {
      // Deduplicate matches
      const unique = [...new Set(matches)]
      results.push({
        piiType: pattern.type,
        label: pattern.label,
        count: unique.length,
        snippet: unique.slice(0, 3).map((m) => pattern.mask(m)).join(', '),
      })
    }
  }

  return results
}

/**
 * Scan all archived EMLs for PII.
 */
export async function scanArchivePii(
  accountId: string,
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<{ scanned: number; withPii: number; findings: number }> {
  const { onProgress } = options
  const db = getDb()

  // Get archived mails not yet scanned
  const alreadyScanned = await db
    .selectFrom('pii_findings')
    .select('archived_mail_id')
    .where('gmail_account_id', '=', accountId)
    .execute()
  const scannedIds = new Set(alreadyScanned.map((r) => r.archived_mail_id))

  const mails = await db
    .selectFrom('archived_mails')
    .select(['id', 'eml_path'])
    .where('gmail_account_id', '=', accountId)
    .execute()

  const toScan = mails.filter((m) => !scannedIds.has(m.id))
  let withPii = 0
  let totalFindings = 0

  for (let i = 0; i < toScan.length; i++) {
    const mail = toScan[i]
    try {
      const content = await fs.readFile(mail.eml_path, 'utf-8')
      const findings = detectPii(content)

      if (findings.length > 0) {
        withPii++
        totalFindings += findings.length

        for (const f of findings) {
          await db
            .insertInto('pii_findings')
            .values({
              gmail_account_id: accountId,
              archived_mail_id: mail.id,
              pii_type: f.piiType,
              count: f.count,
              snippet: f.snippet,
            })
            .execute()
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan EML ${mail.eml_path}: ${(err as Error).message}`)
    }

    onProgress?.(i + 1, toScan.length)
  }

  return { scanned: toScan.length, withPii, findings: totalFindings }
}

/**
 * Get PII scan stats for an account.
 */
export async function getPiiStats(accountId: string) {
  const db = getDb()

  const findings = await db
    .selectFrom('pii_findings')
    .where('gmail_account_id', '=', accountId)
    .select(['pii_type', 'count'])
    .execute()

  const byType: Record<string, number> = {}
  for (const f of findings) {
    byType[f.pii_type] = (byType[f.pii_type] ?? 0) + f.count
  }

  const affectedMails = await db
    .selectFrom('pii_findings')
    .where('gmail_account_id', '=', accountId)
    .select('archived_mail_id')
    .distinct()
    .execute()

  return {
    totalFindings: findings.reduce((s, f) => s + f.count, 0),
    affectedMails: affectedMails.length,
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
  }
}

/**
 * List mails with PII findings, with pagination.
 */
export async function listPiiFindings(
  accountId: string,
  opts: { limit: number; offset: number; piiType?: string },
) {
  const db = getDb()

  let query = db
    .selectFrom('pii_findings')
    .innerJoin('archived_mails', 'pii_findings.archived_mail_id', 'archived_mails.id')
    .where('pii_findings.gmail_account_id', '=', accountId)
    .select([
      'pii_findings.id',
      'pii_findings.archived_mail_id',
      'pii_findings.pii_type',
      'pii_findings.count',
      'pii_findings.snippet',
      'pii_findings.scanned_at',
      'archived_mails.subject',
      'archived_mails.sender',
      'archived_mails.date',
    ])
    .orderBy('pii_findings.scanned_at', 'desc')

  if (opts.piiType) {
    query = query.where('pii_findings.pii_type', '=', opts.piiType)
  }

  let countQuery = db
    .selectFrom('pii_findings')
    .where('gmail_account_id', '=', accountId)
    .select((eb) => eb.fn.countAll<number>().as('count'))

  if (opts.piiType) {
    countQuery = countQuery.where('pii_type', '=', opts.piiType)
  }

  const [rows, countResult] = await Promise.all([
    query.limit(opts.limit).offset(opts.offset).execute(),
    countQuery.executeTakeFirstOrThrow(),
  ])

  return { items: rows, total: countResult.count }
}
