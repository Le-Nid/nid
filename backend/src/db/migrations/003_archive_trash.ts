import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Add soft-delete column to archived_mails
  await db.schema
    .alterTable('archived_mails')
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  // Index for efficient trash listing (only non-null deleted_at)
  await sql`CREATE INDEX idx_archived_mails_deleted_at
    ON archived_mails (gmail_account_id, deleted_at)
    WHERE deleted_at IS NOT NULL`.execute(db)

  // System config table for runtime-configurable settings (e.g. trash retention days)
  await db.schema
    .createTable('system_config')
    .addColumn('key', 'varchar(100)', (col) => col.primaryKey())
    .addColumn('value', 'jsonb', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  // Seed default config
  await db
    .insertInto('system_config')
    .values({
      key: 'archive_trash_retention_days',
      value: JSON.stringify(30),
      updated_at: new Date(),
    })
    .execute()

  await db
    .insertInto('system_config')
    .values({
      key: 'archive_trash_purge_enabled',
      value: JSON.stringify(true),
      updated_at: new Date(),
    })
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('system_config').ifExists().execute()
  await sql`DROP INDEX IF EXISTS idx_archived_mails_deleted_at`.execute(db)
  await db.schema
    .alterTable('archived_mails')
    .dropColumn('deleted_at')
    .execute()
}
