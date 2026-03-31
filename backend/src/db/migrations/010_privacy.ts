import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── Tracking pixels scan results ───────────────────────
  await db.schema
    .createTable('tracking_pixels')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar')
    .addColumn('sender', 'varchar')
    .addColumn('date', 'timestamptz')
    .addColumn('trackers', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('tracker_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('scanned_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tracking_pixels_account_message', ['gmail_account_id', 'gmail_message_id'])
    .execute()

  await db.schema
    .createIndex('idx_tracking_pixels_account')
    .on('tracking_pixels')
    .column('gmail_account_id')
    .execute()

  // ─── PII scan results ──────────────────────────────────
  await db.schema
    .createTable('pii_findings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('archived_mail_id', 'uuid', (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('pii_type', 'varchar', (col) => col.notNull())
    .addColumn('count', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('snippet', 'varchar')
    .addColumn('scanned_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_pii_findings_account')
    .on('pii_findings')
    .column('gmail_account_id')
    .execute()

  await db.schema
    .createIndex('idx_pii_findings_mail')
    .on('pii_findings')
    .column('archived_mail_id')
    .execute()

  // ─── Encryption key metadata ───────────────────────────
  await db.schema
    .alterTable('users')
    .addColumn('encryption_key_hash', 'varchar')
    .execute()

  // ─── Encrypted flag on archived mails ──────────────────
  await db.schema
    .alterTable('archived_mails')
    .addColumn('is_encrypted', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('archived_mails').dropColumn('is_encrypted').execute()
  await db.schema.alterTable('users').dropColumn('encryption_key_hash').execute()
  await db.schema.dropTable('pii_findings').execute()
  await db.schema.dropTable('tracking_pixels').execute()
}
