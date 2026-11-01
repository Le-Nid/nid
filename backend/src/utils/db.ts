import { FastifyReply } from 'fastify'
import { sql } from 'kysely'

/** Escape ILIKE special characters to prevent wildcard injection */
export function escapeIlike(str: string): string {
  return str.replaceAll(/[%_\\]/g, String.raw`\$&`)
}

/** Text search config created by migration 012 (french stemming + unaccent) */
export const FTS_CONFIG = sql.lit('nid_french')

/** Google-like query ("exact phrase", -excluded, OR); never raises a syntax error, safe against operator injection */
export function ftsQuery(term: string) {
  return sql`websearch_to_tsquery(${FTS_CONFIG}, ${term})`
}

/** Send a 404 response with a standardized error message */
export function notFound(reply: FastifyReply, message = 'Not found') {
  return reply.code(404).send({ error: message })
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
