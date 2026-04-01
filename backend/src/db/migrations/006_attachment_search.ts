import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Add attachment_names column to archived_mails
  await db.schema
    .alterTable('archived_mails')
    .addColumn('attachment_names', 'text')
    .execute()

  // Update search vector trigger to include attachment_names
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', COALESCE(NEW.subject,          '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(NEW.sender,           '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(NEW.snippet,          '')), 'C') ||
        setweight(to_tsvector('french', COALESCE(NEW.attachment_names, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  // Backfill attachment_names for existing archived mails
  await sql`
    UPDATE archived_mails am
    SET attachment_names = sub.names
    FROM (
      SELECT archived_mail_id, string_agg(filename, ' ') AS names
      FROM archived_attachments
      GROUP BY archived_mail_id
    ) sub
    WHERE am.id = sub.archived_mail_id
  `.execute(db)

  // Re-trigger search vector update for backfilled rows
  await sql`
    UPDATE archived_mails
    SET subject = subject
    WHERE attachment_names IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  // Restore original trigger
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', COALESCE(NEW.subject,  '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(NEW.sender,   '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(NEW.snippet,  '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await db.schema
    .alterTable('archived_mails')
    .dropColumn('attachment_names')
    .execute()
}
