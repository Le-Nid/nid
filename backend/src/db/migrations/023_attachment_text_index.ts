import { Kysely, sql } from 'kysely'

// The Attachments page searches the attachments' text on its own (not through the mail's search_vector):
// queries must use this exact expression, see attachmentTsv() in archive/attachment-text.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE INDEX IF NOT EXISTS archived_attachments_text_fts_idx
    ON archived_attachments USING GIN (to_tsvector('nid_french', COALESCE(text_content, '')))`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS archived_attachments_text_fts_idx`.execute(db)
}
