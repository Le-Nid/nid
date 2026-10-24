import { Kysely } from 'kysely'

// Password change / admin reset: JWTs issued before this instant are rejected by app.authenticate
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').addColumn('password_changed_at', 'timestamptz').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('password_changed_at').execute()
}
