import { Kysely, sql } from 'kysely'

// The heatmap is computed from archived_mails on each call: its Gmail-sampled cache table goes (derived data only)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('email_activity_heatmap').ifExists().execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('email_activity_heatmap')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('mail_accounts.id').onDelete('cascade'))
    .addColumn('day_of_week', 'integer', (col) => col.notNull())
    .addColumn('hour_of_day', 'integer', (col) => col.notNull())
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()
  await sql`CREATE UNIQUE INDEX email_activity_heatmap_unique
    ON email_activity_heatmap(account_id, day_of_week, hour_of_day)`.execute(db)
}
