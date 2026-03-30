import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('totp_secret', 'varchar(64)')
    .execute()

  await db.schema
    .alterTable('users')
    .addColumn('totp_enabled', 'boolean', (col) => col.defaultTo(false).notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('totp_enabled').execute()
  await db.schema.alterTable('users').dropColumn('totp_secret').execute()
}
