import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Add per-type toast columns
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('weekly_report_toast', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('job_completed_toast', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('job_failed_toast', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('rule_executed_toast', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('quota_warning_toast', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('integrity_alert_toast', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()

  // Drop the old global toggle — replaced by per-type toast columns
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('toast_enabled')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('toast_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('weekly_report_toast')
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('job_completed_toast')
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('job_failed_toast')
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('rule_executed_toast')
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('quota_warning_toast')
    .execute()
  await db.schema
    .alterTable('notification_preferences')
    .dropColumn('integrity_alert_toast')
    .execute()
}
