import { Kysely, sql } from 'kysely'

// A mail account shared read-only with another Nid user: they browse its archive, nothing else
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('account_shares')
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('mail_accounts.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('account_shares_pkey', ['account_id', 'user_id'])
    .execute()
  await db.schema.createIndex('account_shares_user_idx').on('account_shares').column('user_id').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('account_shares').execute()
}
