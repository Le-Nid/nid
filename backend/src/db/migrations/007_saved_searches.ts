import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Table for saved searches / smart folders
  await db.schema
    .createTable('saved_searches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('query', 'text', (col) => col.notNull())
    .addColumn('icon', 'varchar(64)')
    .addColumn('color', 'varchar(32)')
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_saved_searches_user_id')
    .on('saved_searches')
    .column('user_id')
    .execute()

  // Add in_reply_to and references_header to archived_mails for thread reconstruction
  await db.schema
    .alterTable('archived_mails')
    .addColumn('in_reply_to', 'text')
    .execute()

  await db.schema
    .alterTable('archived_mails')
    .addColumn('references_header', 'text')
    .execute()

  // Index for thread grouping on thread_id (already exists as column)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_archived_mails_thread_id
    ON archived_mails (gmail_account_id, thread_id)
    WHERE thread_id IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_archived_mails_thread_id`.execute(db)

  await db.schema
    .alterTable('archived_mails')
    .dropColumn('references_header')
    .execute()

  await db.schema
    .alterTable('archived_mails')
    .dropColumn('in_reply_to')
    .execute()

  await db.schema
    .dropTable('saved_searches')
    .execute()
}
