import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── Retention policies ───────────────────────────────────
  await db.schema
    .createTable('retention_policies')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('gmail_account_id', 'uuid', (col) => col.references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('label', 'varchar(255)')
    .addColumn('max_age_days', 'integer', (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('last_run_at', 'timestamptz')
    .addColumn('deleted_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_retention_policies_user_id')
    .on('retention_policies')
    .column('user_id')
    .execute()

  // ─── Gmail API usage tracking ─────────────────────────────
  await db.schema
    .createTable('gmail_api_usage')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('endpoint', 'varchar(255)', (col) => col.notNull())
    .addColumn('quota_units', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('recorded_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_gmail_api_usage_account_time')
    .on('gmail_api_usage')
    .columns(['gmail_account_id', 'recorded_at'])
    .execute()

  // Nettoyage automatique des données de plus de 30 jours
  await sql`
    CREATE INDEX idx_gmail_api_usage_recorded_at ON gmail_api_usage (recorded_at)
  `.execute(db)

  // ─── Storage config per user ──────────────────────────────
  await db.schema
    .createTable('storage_configs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', 'varchar(20)', (col) => col.notNull().defaultTo(sql`'local'`))
    .addColumn('s3_endpoint', 'varchar(512)')
    .addColumn('s3_region', 'varchar(64)')
    .addColumn('s3_bucket', 'varchar(255)')
    .addColumn('s3_access_key_id', 'varchar(255)')
    .addColumn('s3_secret_access_key', 'varchar(512)')
    .addColumn('s3_force_path_style', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_storage_configs_user_id')
    .on('storage_configs')
    .column('user_id')
    .unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('storage_configs').execute()
  await db.schema.dropTable('gmail_api_usage').execute()
  await db.schema.dropTable('retention_policies').execute()
}
