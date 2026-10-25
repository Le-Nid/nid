import { Kysely, sql } from 'kysely'

// Passkeys (WebAuthn): one row per registered authenticator, removed with its user
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('passkeys')
    .addColumn('id',            'uuid',        (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',       'uuid',        (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('credential_id', 'text',        (col) => col.notNull().unique())   // base64url, sent back by the browser
    .addColumn('public_key',    'bytea',       (col) => col.notNull())
    .addColumn('counter',       'bigint',      (col) => col.defaultTo(0).notNull())
    .addColumn('transports',    sql`text[]`,   (col) => col.defaultTo(sql`'{}'`).notNull())
    .addColumn('name',          'varchar(64)', (col) => col.notNull())
    .addColumn('created_at',    'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('last_used_at',  'timestamptz')
    .execute()
  await sql`CREATE INDEX passkeys_user_idx ON passkeys(user_id)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('passkeys').ifExists().execute()
}
