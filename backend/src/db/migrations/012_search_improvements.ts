import { Kysely, sql } from 'kysely'

// Search config: french stemming + accent-insensitive ("electricite" matches "Électricité").
// Kept in sync with FTS_CONFIG in utils/db.ts.
const CONFIG = 'nid_french'

async function setSearchVectorFunction(db: Kysely<any>, config: string): Promise<void> {
  const c = sql.lit(config)
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector(${c}, COALESCE(NEW.subject,          '')), 'A') ||
        setweight(to_tsvector(${c}, COALESCE(NEW.sender,           '')), 'B') ||
        setweight(to_tsvector(${c}, COALESCE(NEW.snippet,          '')), 'C') ||
        setweight(to_tsvector(${c}, COALESCE(NEW.attachment_names, '')), 'B') ||
        setweight(to_tsvector(${c}, COALESCE(NEW.body_text,        '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  // Recompute existing vectors through the BEFORE UPDATE trigger.
  // shortcut: one blocking UPDATE at startup (seconds per 100k mails), move to a batched job if archives reach millions.
  await sql`UPDATE archived_mails SET search_vector = NULL`.execute(db)
}

export async function up(db: Kysely<any>): Promise<void> {
  // Both are trusted extensions (PG13+): the database owner can create them.
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db)
  await sql.raw(`
    CREATE TEXT SEARCH CONFIGURATION ${CONFIG} (COPY = french);
    ALTER TEXT SEARCH CONFIGURATION ${CONFIG}
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  `).execute(db)
  await setSearchVectorFunction(db, CONFIG)

  // ILIKE '%…%' filters (sender filter, attachments search) can only use trigram indexes.
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_sender_trgm_idx ON archived_mails USING GIN (sender gin_trgm_ops)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_subject_trgm_idx ON archived_mails USING GIN (subject gin_trgm_ops)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_attachments_filename_trgm_idx ON archived_attachments USING GIN (filename gin_trgm_ops)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS archived_attachments_filename_trgm_idx`.execute(db)
  await sql`DROP INDEX IF EXISTS archived_mails_subject_trgm_idx`.execute(db)
  await sql`DROP INDEX IF EXISTS archived_mails_sender_trgm_idx`.execute(db)
  await setSearchVectorFunction(db, 'french')
  await sql.raw(`DROP TEXT SEARCH CONFIGURATION IF EXISTS ${CONFIG}`).execute(db)
  // Extensions are left installed: harmless, and another schema object may depend on them.
}
