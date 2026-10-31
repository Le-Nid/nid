import crypto from 'node:crypto'
import { sql } from 'kysely'
import { getDb } from '../db'
import type { ApiTokenScope } from '../db/types'

// nid_ + 32 random bytes (base64url): high entropy, so a plain SHA-256 is enough to store it
export const API_TOKEN_RE = /^nid_[A-Za-z0-9_-]{43}$/

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createApiToken(userId: string, name: string, scope: ApiTokenScope, expiresInDays: number | null) {
  const token = `nid_${crypto.randomBytes(32).toString('base64url')}`
  const row = await getDb().insertInto('api_tokens').values({
    user_id: userId,
    name,
    scope,
    token_hash: hashApiToken(token),
    expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
  }).returning(['id', 'name', 'scope', 'expires_at', 'last_used_at', 'created_at']).executeTakeFirstOrThrow()
  return { ...row, token }
}

/** The token's owner and scope, or null when it is unknown, expired or its user is deactivated. */
export async function verifyApiToken(token: string) {
  const db = getDb()
  const found = await db
    .selectFrom('api_tokens')
    .innerJoin('users', 'users.id', 'api_tokens.user_id')
    .select(['api_tokens.id', 'api_tokens.scope', 'users.id as userId', 'users.email'])
    .where('api_tokens.token_hash', '=', hashApiToken(token))
    .where('users.is_active', '=', true)
    .where((eb) => eb.or([eb('api_tokens.expires_at', 'is', null), eb('api_tokens.expires_at', '>', new Date())]))
    .executeTakeFirst()
  if (!found) return null
  // At most one write per minute per token: Home Assistant polls every few seconds
  await db.updateTable('api_tokens').set({ last_used_at: new Date() })
    .where('id', '=', found.id)
    .where((eb) => eb.or([eb('last_used_at', 'is', null), eb('last_used_at', '<', sql<Date>`NOW() - INTERVAL '1 minute'`)]))
    .execute()
  return found
}
