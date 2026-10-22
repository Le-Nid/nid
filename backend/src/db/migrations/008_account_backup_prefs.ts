import { Kysely, sql } from 'kysely'

// B12: automatic NAS backup per Gmail account (read by the scheduler); « Action requise » when Google
// refuses the refresh token (auth_error_at); soft disconnect clears the tokens (nullable) and keeps the row and
// its archives; B10: reader preference for remote images, with the other user prefs.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('gmail_accounts')
    .addColumn('backup_enabled', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('backup_interval', 'text', (c) => c.notNull().defaultTo('24h').check(sql`backup_interval IN ('1h', '6h', '24h')`))
    .addColumn('last_backup_at', 'timestamptz')
    .addColumn('auth_error_at', 'timestamptz')
    .execute()
  await db.schema.alterTable('gmail_accounts').alterColumn('access_token', (c) => c.dropNotNull()).execute()
  await db.schema.alterTable('gmail_accounts').alterColumn('refresh_token', (c) => c.dropNotNull()).execute()
  await db.schema
    .alterTable('notification_preferences')
    .addColumn('remote_images', 'text', (c) => c.notNull().defaultTo('block').check(sql`remote_images IN ('block', 'allow')`))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('notification_preferences').dropColumn('remote_images').execute()
  await sql`UPDATE gmail_accounts SET access_token = COALESCE(access_token, ''), refresh_token = COALESCE(refresh_token, '')`.execute(db)
  await db.schema.alterTable('gmail_accounts').alterColumn('access_token', (c) => c.setNotNull()).execute()
  await db.schema.alterTable('gmail_accounts').alterColumn('refresh_token', (c) => c.setNotNull()).execute()
  await db.schema
    .alterTable('gmail_accounts')
    .dropColumn('backup_enabled')
    .dropColumn('backup_interval')
    .dropColumn('last_backup_at')
    .dropColumn('auth_error_at')
    .execute()
}
