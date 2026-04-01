import crypto from 'node:crypto'
import fs from 'fs/promises'
import { simpleParser } from 'mailparser'
import { getDb } from '../db'
import { config } from '../config'
import pino from 'pino'

const logger = pino({ name: 'sharing-service' })

export interface ShareCreateDTO {
  archivedMailId: string
  expiresInHours?: number
  maxAccess?: number
}

// ─── Create share link ──────────────────────────────────────

export async function createShareLink(userId: string, dto: ShareCreateDTO) {
  const db = getDb()

  // Verify the user owns this archived mail
  const mail = await db
    .selectFrom('archived_mails')
    .innerJoin('gmail_accounts', 'archived_mails.gmail_account_id', 'gmail_accounts.id')
    .select([
      'archived_mails.id',
      'archived_mails.subject',
      'archived_mails.sender',
      'archived_mails.date',
      'archived_mails.eml_path',
    ])
    .where('archived_mails.id', '=', dto.archivedMailId)
    .where('gmail_accounts.user_id', '=', userId)
    .executeTakeFirst()

  if (!mail) {
    throw new Error('Archived mail not found or access denied')
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresInHours = dto.expiresInHours ?? 24
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000)

  const share = await db
    .insertInto('archive_shares')
    .values({
      archived_mail_id: dto.archivedMailId,
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
      max_access: dto.maxAccess ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return {
    ...share,
    subject: mail.subject,
    sender: mail.sender,
    date: mail.date,
  }
}

// ─── Access shared mail (public — no auth) ──────────────────

export async function getSharedMail(token: string) {
  const db = getDb()
  const now = new Date()

  const share = await db
    .selectFrom('archive_shares')
    .innerJoin('archived_mails', 'archive_shares.archived_mail_id', 'archived_mails.id')
    .select([
      'archive_shares.id as share_id',
      'archive_shares.token',
      'archive_shares.expires_at',
      'archive_shares.access_count',
      'archive_shares.max_access',
      'archived_mails.id as mail_id',
      'archived_mails.subject',
      'archived_mails.sender',
      'archived_mails.recipient',
      'archived_mails.date',
      'archived_mails.snippet',
      'archived_mails.eml_path',
      'archived_mails.is_encrypted',
    ])
    .where('archive_shares.token', '=', token)
    .executeTakeFirst()

  if (!share) return null

  // Check expiration
  if (new Date(share.expires_at) < now) return null

  // Check max access
  if (share.max_access !== null && share.access_count >= share.max_access) return null

  // Check encrypted (can't share encrypted mails)
  if (share.is_encrypted) return null

  // Increment access count
  await db
    .updateTable('archive_shares')
    .set({ access_count: share.access_count + 1 })
    .where('id', '=', share.share_id)
    .execute()

  // Read EML and extract HTML body
  let htmlBody: string | null = null
  let textBody: string | null = null

  try {
    const emlContent = await fs.readFile(share.eml_path, 'utf-8')
    const parsed = await simpleParser(emlContent)
    htmlBody = parsed.html || null
    textBody = parsed.text || null
  } catch (err) {
    logger.error({ err, emlPath: share.eml_path }, 'Failed to read shared EML')
  }

  return {
    subject: share.subject,
    sender: share.sender,
    recipient: share.recipient,
    date: share.date,
    snippet: share.snippet,
    htmlBody,
    textBody,
  }
}

// ─── List user's shares ─────────────────────────────────────

export async function getUserShares(userId: string) {
  return getDb()
    .selectFrom('archive_shares')
    .innerJoin('archived_mails', 'archive_shares.archived_mail_id', 'archived_mails.id')
    .select([
      'archive_shares.id',
      'archive_shares.token',
      'archive_shares.expires_at',
      'archive_shares.access_count',
      'archive_shares.max_access',
      'archive_shares.created_at',
      'archived_mails.subject',
      'archived_mails.sender',
      'archived_mails.date',
    ])
    .where('archive_shares.user_id', '=', userId)
    .orderBy('archive_shares.created_at', 'desc')
    .execute()
}

// ─── Revoke share ───────────────────────────────────────────

export async function revokeShare(shareId: string, userId: string) {
  const result = await getDb()
    .deleteFrom('archive_shares')
    .where('id', '=', shareId)
    .where('user_id', '=', userId)
    .executeTakeFirst()

  return Number(result.numDeletedRows) > 0
}

// ─── Cleanup expired shares ─────────────────────────────────

export async function cleanupExpiredShares(): Promise<number> {
  const result = await getDb()
    .deleteFrom('archive_shares')
    .where('expires_at', '<', new Date())
    .executeTakeFirst()

  const count = Number(result.numDeletedRows)
  if (count > 0) {
    logger.info(`Cleaned up ${count} expired share(s)`)
  }
  return count
}
