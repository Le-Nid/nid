import { Kysely, sql } from 'kysely'
import type { Database } from '../db/types'
import { escapeIlike } from '../utils/db'

export interface ArchiveContact {
  email: string
  name: string | null
  from_count: number // archived mails this contact sent
  to_count: number   // archived mails addressed to this contact
  last_at: string | null
}

// One match per address: "Martin, Bob" <bob@x.fr> | Ana <ana@x.fr> | carl@x.fr → [quoted name, bare name, <email>, bare email]
const ADDRESS = String.raw`(?:"([^"]*)"|([^,<"]*?))\s*<([^<>\s]+@[^<>\s]+)>|([^\s<>",;]+@[^\s<>",;]+)`

/**
 * Address book of one account's archive, from the From and To headers (trash excluded), the account's own
 * address left out. Most exchanged first. `name` is one of the display names seen (a sort of the last one costs 3×).
 * shortcut: computed on each call (a scan of the account's headers, ~0.3 s per 100k mails); store contacts at archive time if archives grow past that.
 */
export async function listArchiveContacts(
  db: Kysely<Database>,
  accountId: string,
  { q, limit, offset }: { q?: string; limit: number; offset: number },
): Promise<{ contacts: ArchiveContact[]; total: number }> {
  const search = q?.trim() ? `%${escapeIlike(q.trim())}%` : null
  const { rows } = await sql<ArchiveContact & { total: string }>`
    WITH addresses AS (
      SELECT h.dir, m.date,
        lower(coalesce(x[3], x[4])) AS email,
        NULLIF(btrim(coalesce(x[1], x[2]), ${` "'`}), '') AS name
      FROM archived_mails m
      CROSS JOIN LATERAL (VALUES ('from', m.sender), ('to', m.recipient)) h(dir, header)
      CROSS JOIN LATERAL regexp_matches(h.header, ${ADDRESS}, 'g') x
      WHERE m.account_id = ${accountId} AND m.deleted_at IS NULL
    ), contacts AS (
      SELECT email,
        max(name) AS name,
        count(*) FILTER (WHERE dir = 'from')::int AS from_count,
        count(*) FILTER (WHERE dir = 'to')::int AS to_count,
        max(date) AS last_at
      FROM addresses
      WHERE email <> (SELECT lower(email) FROM mail_accounts WHERE id = ${accountId})
      GROUP BY email
    )
    SELECT *, count(*) OVER () AS total
    FROM contacts
    WHERE ${search}::text IS NULL OR email ILIKE ${search} OR name ILIKE ${search}
    ORDER BY from_count + to_count DESC, last_at DESC NULLS LAST, email
    LIMIT ${limit} OFFSET ${offset}
  `.execute(db)
  return {
    contacts: rows.map(({ total: _total, ...c }) => c),
    total: rows.length ? Number(rows[0].total) : 0,
  }
}
