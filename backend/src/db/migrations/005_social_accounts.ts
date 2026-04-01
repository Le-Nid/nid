import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_social_accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'varchar(50)', (col) => col.notNull()) // 'google' | 'github' | 'discord' | 'microsoft'
    .addColumn('provider_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('email', 'varchar(255)')
    .addColumn('display_name', 'varchar(255)')
    .addColumn('avatar_url', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE UNIQUE INDEX user_social_accounts_provider_unique
    ON user_social_accounts(provider, provider_id)`.execute(db)

  await sql`CREATE INDEX user_social_accounts_user_id
    ON user_social_accounts(user_id)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_social_accounts').execute()
}
