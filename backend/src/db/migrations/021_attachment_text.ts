import { Kysely, sql } from 'kysely'

// Text of PDF/DOCX attachments (NULL: not extracted yet, '' : none), searched with the mail at weight D
const FTS = sql.lit('nid_french')

async function setSearchVectorFunction(db: Kysely<any>, withAttachments: boolean): Promise<void> {
  // Capped: a tsvector over ~1 MB is an error, and the body is already up to 100k chars
  const attachments = withAttachments
    ? sql` ||
        setweight(to_tsvector(${FTS}, COALESCE((SELECT left(string_agg(text_content, ' '), 200000)
          FROM archived_attachments WHERE archived_mail_id = NEW.id AND text_content <> ''), '')), 'D')`
    : sql``
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector(${FTS}, COALESCE(NEW.subject,          '')), 'A') ||
        setweight(to_tsvector(${FTS}, COALESCE(NEW.sender,           '')), 'B') ||
        setweight(to_tsvector(${FTS}, COALESCE(NEW.snippet,          '')), 'C') ||
        setweight(to_tsvector(${FTS}, COALESCE(NEW.attachment_names, '')), 'B') ||
        setweight(to_tsvector(${FTS}, COALESCE(NEW.body_text,        '')), 'D')${attachments};
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('archived_attachments').addColumn('text_content', 'text').execute()
  await setSearchVectorFunction(db, true)
  // An attachment's text lands after its mail row (insert, backfill): recompute that mail's vector then
  await sql`
    CREATE OR REPLACE FUNCTION touch_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE archived_mails SET search_vector = NULL WHERE id = NEW.archived_mail_id;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER attachment_text_insert AFTER INSERT ON archived_attachments
    FOR EACH ROW WHEN (NEW.text_content <> '') EXECUTE FUNCTION touch_mail_search_vector()
  `.execute(db)
  await sql`
    CREATE TRIGGER attachment_text_update AFTER UPDATE OF text_content ON archived_attachments
    FOR EACH ROW WHEN (NEW.text_content IS DISTINCT FROM OLD.text_content) EXECUTE FUNCTION touch_mail_search_vector()
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS attachment_text_update ON archived_attachments`.execute(db)
  await sql`DROP TRIGGER IF EXISTS attachment_text_insert ON archived_attachments`.execute(db)
  await sql`DROP FUNCTION IF EXISTS touch_mail_search_vector()`.execute(db)
  await setSearchVectorFunction(db, false)
  await db.schema.alterTable('archived_attachments').dropColumn('text_content').execute()
  // Vectors already holding attachment words keep them until their mail is next updated: harmless extra matches
}
