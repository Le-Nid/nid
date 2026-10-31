import { Kysely, sql } from 'kysely'

// Nid's own tags on archived mails: never sent to Gmail, kept across re-archives (label_ids follow the mailbox)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('archived_mails')
    .addColumn('tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .execute()
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_tags_idx ON archived_mails USING GIN (tags)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS archived_mails_tags_idx`.execute(db)
  await db.schema.alterTable('archived_mails').dropColumn('tags').execute()
}
