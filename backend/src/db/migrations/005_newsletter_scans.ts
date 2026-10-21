import { Kysely, sql } from 'kysely'

// L6: cached result of the scan_unsubscribe job, so /cleanup no longer scans the mailbox on every load
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('newsletter_scans')
    .addColumn('gmail_account_id', 'uuid', (col) => col.primaryKey().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('senders', 'jsonb', (col) => col.defaultTo(sql`'[]'::jsonb`).notNull())
    .addColumn('scanned_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('newsletter_scans').ifExists().execute()
}
