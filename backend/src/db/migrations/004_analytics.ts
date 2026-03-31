import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Table pour le heatmap d'activité email (cache agrégé)
  await db.schema
    .createTable('email_activity_heatmap')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('day_of_week', 'integer', (col) => col.notNull()) // 0=lundi … 6=dimanche
    .addColumn('hour_of_day', 'integer', (col) => col.notNull()) // 0-23
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE UNIQUE INDEX email_activity_heatmap_unique
    ON email_activity_heatmap(gmail_account_id, day_of_week, hour_of_day)`.execute(db)

  // Table pour le score d'encombrement par expéditeur
  await db.schema
    .createTable('sender_scores')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('sender', 'text', (col) => col.notNull())
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('total_size_bytes', 'bigint', (col) => col.defaultTo(0).notNull())
    .addColumn('unread_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('has_unsubscribe', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('read_rate', 'real', (col) => col.defaultTo(0).notNull()) // 0.0 - 1.0
    .addColumn('clutter_score', 'real', (col) => col.defaultTo(0).notNull()) // 0-100
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE UNIQUE INDEX sender_scores_unique
    ON sender_scores(gmail_account_id, sender)`.execute(db)

  // Table pour les suggestions de nettoyage
  await db.schema
    .createTable('cleanup_suggestions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('type', 'varchar(50)', (col) => col.notNull()) // 'bulk_unread', 'large_sender', 'old_newsletters', 'duplicate_pattern'
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('sender', 'text')
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('total_size_bytes', 'bigint', (col) => col.defaultTo(0).notNull())
    .addColumn('query', 'text') // requête Gmail pour cibler ces mails
    .addColumn('is_dismissed', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  // Table pour le tracker Inbox Zero
  await db.schema
    .createTable('inbox_zero_snapshots')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('inbox_count', 'integer', (col) => col.notNull())
    .addColumn('unread_count', 'integer', (col) => col.notNull())
    .addColumn('recorded_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE INDEX inbox_zero_snapshots_account_date
    ON inbox_zero_snapshots(gmail_account_id, recorded_at DESC)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('inbox_zero_snapshots').ifExists().execute()
  await db.schema.dropTable('cleanup_suggestions').ifExists().execute()
  await db.schema.dropTable('sender_scores').ifExists().execute()
  await db.schema.dropTable('email_activity_heatmap').ifExists().execute()
}
