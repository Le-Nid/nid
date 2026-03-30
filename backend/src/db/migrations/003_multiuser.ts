import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── users — nouvelles colonnes multi-utilisateurs ──────
  await db.schema
    .alterTable('users')
    .addColumn('role', 'varchar(20)', (col) => col.defaultTo('user').notNull())
    .addColumn('display_name', 'varchar(255)')
    .addColumn('avatar_url', 'text')
    .addColumn('google_id', 'varchar(255)')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true).notNull())
    .addColumn('max_gmail_accounts', 'integer', (col) => col.defaultTo(3).notNull())
    .addColumn('storage_quota_bytes', 'bigint', (col) =>
      col.defaultTo(5_368_709_120).notNull(), // 5 Go
    )
    .addColumn('last_login_at', 'timestamptz')
    .execute()

  // password_hash nullable pour les comptes Google SSO (pas de mot de passe)
  await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`.execute(db)

  // Unique constraint sur google_id
  await sql`CREATE UNIQUE INDEX users_google_id_unique ON users(google_id) WHERE google_id IS NOT NULL`.execute(db)

  // ─── jobs — ajouter user_id ─────────────────────────────
  await db.schema
    .alterTable('jobs')
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .execute()

  await sql`CREATE INDEX jobs_user_id_idx ON jobs(user_id)`.execute(db)

  // Remplir user_id des jobs existants à partir de gmail_accounts
  await sql`
    UPDATE jobs SET user_id = ga.user_id
    FROM gmail_accounts ga
    WHERE jobs.gmail_account_id = ga.id
      AND jobs.user_id IS NULL
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  // jobs
  await db.schema.alterTable('jobs').dropColumn('user_id').execute()

  // users
  await sql`DROP INDEX IF EXISTS users_google_id_unique`.execute(db)
  await sql`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL`.execute(db)

  await db.schema
    .alterTable('users')
    .dropColumn('role')
    .dropColumn('display_name')
    .dropColumn('avatar_url')
    .dropColumn('google_id')
    .dropColumn('is_active')
    .dropColumn('max_gmail_accounts')
    .dropColumn('storage_quota_bytes')
    .dropColumn('last_login_at')
    .execute()
}
