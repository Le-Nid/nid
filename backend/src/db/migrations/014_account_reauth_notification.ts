import { Kysely } from 'kysely'

// « Compte à reconnecter »: Google refused an account's refresh token (bell on, toast off, like the other alerts)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('notification_preferences')
    .addColumn('account_reauth', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('account_reauth_toast', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('notification_preferences').dropColumn('account_reauth').dropColumn('account_reauth_toast').execute()
}
