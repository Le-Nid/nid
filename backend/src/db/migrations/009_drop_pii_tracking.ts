import { Kysely, sql } from 'kysely'

// O7 (design/ui-redesign.md §10): the PII and tracking-pixel scans are gone from the UI and the API; their
// results go with them. down() restores the empty tables only: the purged rows are not recoverable.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pii_findings').ifExists().execute()
  await db.schema.dropTable('tracking_pixels').ifExists().execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('tracking_pixels')
    .addColumn('id',                'uuid',      (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id',  'uuid',      (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id',  'varchar',   (col) => col.notNull())
    .addColumn('subject',           'varchar')
    .addColumn('sender',            'varchar')
    .addColumn('date',              'timestamptz')
    .addColumn('trackers',          'jsonb',     (col) => col.notNull().defaultTo('[]'))
    .addColumn('tracker_count',     'integer',   (col) => col.notNull().defaultTo(0))
    .addColumn('scanned_at',        'timestamptz',(col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tracking_pixels_account_message', ['gmail_account_id', 'gmail_message_id'])
    .execute()
  await sql`CREATE INDEX idx_tracking_pixels_account ON tracking_pixels(gmail_account_id)`.execute(db)

  await db.schema
    .createTable('pii_findings')
    .addColumn('id',                'uuid',      (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id',  'uuid',      (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('archived_mail_id',  'uuid',      (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('pii_type',          'varchar',   (col) => col.notNull())
    .addColumn('count',             'integer',   (col) => col.notNull().defaultTo(1))
    .addColumn('snippet',           'varchar')
    .addColumn('scanned_at',        'timestamptz',(col) => col.notNull().defaultTo(sql`now()`))
    .execute()
  await sql`CREATE INDEX idx_pii_findings_account ON pii_findings(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX idx_pii_findings_mail    ON pii_findings(archived_mail_id)`.execute(db)
}
