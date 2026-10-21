import { Kysely, sql } from 'kysely'

// B2: full-text search on the mail body (weight D). body_text stays NULL for encrypted archives.
async function setSearchVectorFunction(db: Kysely<any>, withBody: boolean): Promise<void> {
  const body = withBody ? sql` || setweight(to_tsvector('french', COALESCE(NEW.body_text, '')), 'D')` : sql``
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', COALESCE(NEW.subject,          '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(NEW.sender,           '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(NEW.snippet,          '')), 'C') ||
        setweight(to_tsvector('french', COALESCE(NEW.attachment_names, '')), 'B')${body};
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('archived_mails').addColumn('body_text', 'text').execute()
  await setSearchVectorFunction(db, true)
}

export async function down(db: Kysely<any>): Promise<void> {
  await setSearchVectorFunction(db, false)
  await db.schema.alterTable('archived_mails').dropColumn('body_text').execute()
}
