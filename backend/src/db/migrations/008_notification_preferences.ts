import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('notification_preferences')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade').unique())
    .addColumn('weekly_report', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('job_completed', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('job_failed', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('rule_executed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('quota_warning', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('integrity_alert', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('toast_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('notification_preferences').ifExists().execute()
}
