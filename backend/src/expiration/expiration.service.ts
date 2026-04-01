import { getDb } from '../db'
import { trashMessages } from '../gmail/gmail.service'
import pino from 'pino'

const logger = pino({ name: 'expiration-service' })

// ─── Heuristic categories for auto-detection ────────────────
const HEURISTIC_PATTERNS: Array<{ category: string; subjectPatterns: RegExp[]; senderPatterns: RegExp[]; defaultDays: number }> = [
  {
    category: 'otp',
    subjectPatterns: [
      /\b(otp|verification|vérification|2fa|two.?factor|mot de passe|password|connexion|sign.?in|login)\b/i,
      /\b(confirm(?:ation)?|token|sécurité|security)\s+(code|connexion)/i,
      /\bcode\s+(de\s+)?(verification|vérification|connexion|sécurité|security)\b/i,
      /\bverification\s+code\b/i,
    ],
    senderPatterns: [/noreply|no-reply|security|verification|auth/i],
    defaultDays: 1,
  },
  {
    category: 'delivery',
    subjectPatterns: [
      /\b(livraison|delivery|shipped|expédié|colis|package|tracking|suivi|commande|order)\b/i,
      /\b(acheminement|dispatched|en route)\b/i,
    ],
    senderPatterns: [/ups|fedex|dhl|colissimo|chronopost|amazon|laposte|mondial.?relay/i],
    defaultDays: 14,
  },
  {
    category: 'promo',
    subjectPatterns: [
      /\b(promo|promotion|soldes|sale|réduction|discount|offre|offer|deal|coupon|code promo)\b/i,
      /\b(flash|limited|limité|exclusi[fv]e?|spécial|special)\b/i,
    ],
    senderPatterns: [/newsletter|marketing|promo|deals|offers/i],
    defaultDays: 7,
  },
]

export interface ExpirationCreateDTO {
  gmailMessageId: string
  subject?: string
  sender?: string
  expiresAt?: string  // ISO date
  expiresInDays?: number
  category?: string
}

export interface DetectedExpiration {
  gmailMessageId: string
  subject: string | null
  sender: string | null
  category: string
  suggestedDays: number
}

// ─── CRUD ───────────────────────────────────────────────────

export async function getExpirations(accountId: string) {
  return getDb()
    .selectFrom('email_expirations')
    .selectAll()
    .where('gmail_account_id', '=', accountId)
    .where('is_deleted', '=', false)
    .orderBy('expires_at', 'asc')
    .execute()
}

export async function getExpiration(id: string, accountId: string) {
  return getDb()
    .selectFrom('email_expirations')
    .selectAll()
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .executeTakeFirst() ?? null
}

export async function createExpiration(accountId: string, dto: ExpirationCreateDTO) {
  const expiresAt = dto.expiresAt
    ? new Date(dto.expiresAt)
    : new Date(Date.now() + (dto.expiresInDays ?? 7) * 24 * 3600 * 1000)

  return getDb()
    .insertInto('email_expirations')
    .values({
      gmail_account_id: accountId,
      gmail_message_id: dto.gmailMessageId,
      subject: dto.subject ?? null,
      sender: dto.sender ?? null,
      expires_at: expiresAt.toISOString(),
      category: dto.category ?? 'manual',
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function createExpirationsBatch(accountId: string, items: ExpirationCreateDTO[]) {
  if (items.length === 0) return []

  const values = items.map((dto) => ({
    gmail_account_id: accountId,
    gmail_message_id: dto.gmailMessageId,
    subject: dto.subject ?? null,
    sender: dto.sender ?? null,
    expires_at: dto.expiresAt
      ? new Date(dto.expiresAt).toISOString()
      : new Date(Date.now() + (dto.expiresInDays ?? 7) * 24 * 3600 * 1000).toISOString(),
    category: dto.category ?? 'manual',
  }))

  return getDb()
    .insertInto('email_expirations')
    .values(values)
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .execute()
}

export async function deleteExpiration(id: string, accountId: string) {
  await getDb()
    .deleteFrom('email_expirations')
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .execute()
}

export async function updateExpirationDate(id: string, accountId: string, expiresAt: string) {
  return getDb()
    .updateTable('email_expirations')
    .set({ expires_at: new Date(expiresAt).toISOString() })
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

// ─── Heuristic detection ────────────────────────────────────

export function detectCategory(subject: string | null, sender: string | null): DetectedExpiration['category'] | null {
  for (const pattern of HEURISTIC_PATTERNS) {
    const subjectMatch = subject && pattern.subjectPatterns.some((re) => re.test(subject))
    const senderMatch = sender && pattern.senderPatterns.some((re) => re.test(sender))
    if (subjectMatch || senderMatch) {
      return pattern.category
    }
  }
  return null
}

export function getSuggestedDays(category: string): number {
  const match = HEURISTIC_PATTERNS.find((p) => p.category === category)
  return match?.defaultDays ?? 7
}

// ─── Process expired emails ─────────────────────────────────

export async function processExpiredEmails(): Promise<{ processed: number; errors: number }> {
  const db = getDb()
  const now = new Date()

  // Find all non-deleted expirations that have passed
  const expired = await db
    .selectFrom('email_expirations')
    .innerJoin('gmail_accounts', 'email_expirations.gmail_account_id', 'gmail_accounts.id')
    .select([
      'email_expirations.id',
      'email_expirations.gmail_account_id',
      'email_expirations.gmail_message_id',
      'email_expirations.subject',
    ])
    .where('email_expirations.is_deleted', '=', false)
    .where('email_expirations.expires_at', '<=', now)
    .where('gmail_accounts.is_active', '=', true)
    .execute()

  if (expired.length === 0) return { processed: 0, errors: 0 }

  logger.info(`Processing ${expired.length} expired email(s)`)

  // Group by account
  const byAccount = new Map<string, typeof expired>()
  for (const item of expired) {
    const list = byAccount.get(item.gmail_account_id) ?? []
    list.push(item)
    byAccount.set(item.gmail_account_id, list)
  }

  let processed = 0
  let errors = 0

  for (const [accountId, items] of byAccount) {
    const messageIds = items.map((i) => i.gmail_message_id)
    const expirationIds = items.map((i) => i.id)

    try {
      await trashMessages(accountId, messageIds)

      // Mark as deleted
      await db
        .updateTable('email_expirations')
        .set({ is_deleted: true, deleted_at: now })
        .where('id', 'in', expirationIds)
        .execute()

      processed += items.length
      logger.info(`Trashed ${items.length} expired email(s) for account ${accountId}`)
    } catch (err) {
      errors += items.length
      logger.error({ err, accountId }, `Failed to trash expired emails`)
    }
  }

  return { processed, errors }
}

// ─── Stats ──────────────────────────────────────────────────

export async function getExpirationStats(accountId: string) {
  const db = getDb()
  const now = new Date()

  const [total, pending, deleted, expiringSoon] = await Promise.all([
    db.selectFrom('email_expirations')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('gmail_account_id', '=', accountId)
      .executeTakeFirstOrThrow(),

    db.selectFrom('email_expirations')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('gmail_account_id', '=', accountId)
      .where('is_deleted', '=', false)
      .executeTakeFirstOrThrow(),

    db.selectFrom('email_expirations')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('gmail_account_id', '=', accountId)
      .where('is_deleted', '=', true)
      .executeTakeFirstOrThrow(),

    db.selectFrom('email_expirations')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('gmail_account_id', '=', accountId)
      .where('is_deleted', '=', false)
      .where('expires_at', '<=', new Date(now.getTime() + 24 * 3600 * 1000))
      .executeTakeFirstOrThrow(),
  ])

  return {
    total: Number(total.count),
    pending: Number(pending.count),
    deleted: Number(deleted.count),
    expiringSoon: Number(expiringSoon.count),
  }
}
