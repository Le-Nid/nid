import { Kysely, sql } from 'kysely'

// API tokens (Home Assistant, scripts): only the SHA-256 of the token is stored, removed with its user
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('api_tokens')
    .addColumn('id',           'uuid',        (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',      'uuid',        (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name',         'varchar(64)', (col) => col.notNull())
    .addColumn('token_hash',   'char(64)',    (col) => col.notNull().unique())
    .addColumn('scope',        'varchar(8)',  (col) => col.notNull().defaultTo('read').check(sql`scope IN ('read', 'write')`))
    .addColumn('expires_at',   'timestamptz')
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('created_at',   'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()
  await sql`CREATE INDEX api_tokens_user_idx ON api_tokens(user_id)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('api_tokens').ifExists().execute()
}
