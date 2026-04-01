import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── Email expirations ────────────────────────────────────
  await db.schema
    .createTable('email_expirations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('subject', 'text')
    .addColumn('sender', 'text')
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('category', 'varchar(50)', (col) => col.notNull().defaultTo('manual'))
    .addColumn('is_deleted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_email_expirations_account')
    .on('email_expirations')
    .column('gmail_account_id')
    .execute()

  await db.schema
    .createIndex('idx_email_expirations_expires_at')
    .on('email_expirations')
    .column('expires_at')
    .execute()

  await sql`
    CREATE UNIQUE INDEX idx_email_expirations_unique
    ON email_expirations (gmail_account_id, gmail_message_id)
    WHERE is_deleted = false
  `.execute(db)

  // ─── Archive shares ───────────────────────────────────────
  await db.schema
    .createTable('archive_shares')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('archived_mail_id', 'uuid', (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('access_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_access', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_token')
    .on('archive_shares')
    .column('token')
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_mail')
    .on('archive_shares')
    .column('archived_mail_id')
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_expires_at')
    .on('archive_shares')
    .column('expires_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('archive_shares').execute()
  await db.schema.dropTable('email_expirations').execute()
}
