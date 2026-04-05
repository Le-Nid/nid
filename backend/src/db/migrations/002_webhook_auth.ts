import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('webhooks')
    .addColumn('auth_user', 'varchar(255)')
    .execute()

  await db.schema
    .alterTable('webhooks')
    .addColumn('auth_password', 'varchar(255)')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('webhooks')
    .dropColumn('auth_password')
    .execute()

  await db.schema
    .alterTable('webhooks')
    .dropColumn('auth_user')
    .execute()
}
