import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── Extensions ───────────────────────────────────────────
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`.execute(db)

  // ─── updated_at trigger function ─────────────────────────
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  // ─── users ───────────────────────────────────────────────
  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id',            'uuid',         col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('email',         'varchar(255)', col => col.unique().notNull())
    .addColumn('password_hash', 'varchar(255)', col => col.notNull())
    .addColumn('created_at',    'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',    'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  // ─── gmail_accounts ───────────────────────────────────────
  await db.schema
    .createTable('gmail_accounts')
    .ifNotExists()
    .addColumn('id',            'uuid',         col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('user_id',       'uuid',         col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('email',         'varchar(255)', col => col.notNull())
    .addColumn('access_token',  'text',         col => col.notNull())
    .addColumn('refresh_token', 'text',         col => col.notNull())
    .addColumn('token_expiry',  'timestamptz',  col => col.notNull())
    .addColumn('is_active',     'boolean',      col => col.defaultTo(true).notNull())
    .addColumn('created_at',    'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',    'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .addUniqueConstraint('gmail_accounts_user_email_unique', ['user_id', 'email'])
    .execute()

  await sql`
    CREATE TRIGGER gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  // ─── archived_mails ───────────────────────────────────────
  await db.schema
    .createTable('archived_mails')
    .ifNotExists()
    .addColumn('id',               'uuid',         col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid',         col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id', 'varchar(255)', col => col.notNull())
    .addColumn('thread_id',        'varchar(255)', col => col.defaultTo(null))
    .addColumn('subject',          'text',         col => col.defaultTo(null))
    .addColumn('sender',           'varchar(500)', col => col.defaultTo(null))
    .addColumn('recipient',        'text',         col => col.defaultTo(null))
    .addColumn('date',             'timestamptz',  col => col.defaultTo(null))
    .addColumn('size_bytes',       'bigint',       col => col.defaultTo(0).notNull())
    .addColumn('has_attachments',  'boolean',      col => col.defaultTo(false).notNull())
    .addColumn('label_ids',        sql`text[]`,    col => col.defaultTo(sql`'{}'`).notNull())
    .addColumn('eml_path',         'text',         col => col.notNull())
    .addColumn('snippet',          'text',         col => col.defaultTo(null))
    .addColumn('search_vector',    sql`tsvector`)
    .addColumn('archived_at',      'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .addUniqueConstraint('archived_mails_account_message_unique', ['gmail_account_id', 'gmail_message_id'])
    .execute()

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_search_idx ON archived_mails USING GIN(search_vector)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_account_idx ON archived_mails(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_sender_idx  ON archived_mails(sender)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_date_idx    ON archived_mails(date DESC)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS archived_mails_size_idx    ON archived_mails(size_bytes DESC)`.execute(db)

  // Trigger full-text search vector
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', COALESCE(NEW.subject,  '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(NEW.sender,   '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(NEW.snippet,  '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE TRIGGER mail_search_vector_update
    BEFORE INSERT OR UPDATE ON archived_mails
    FOR EACH ROW EXECUTE FUNCTION update_mail_search_vector()
  `.execute(db)

  // ─── archived_attachments ─────────────────────────────────
  await db.schema
    .createTable('archived_attachments')
    .ifNotExists()
    .addColumn('id',               'uuid',         col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('archived_mail_id', 'uuid',         col => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('filename',         'varchar(500)', col => col.notNull())
    .addColumn('mime_type',        'varchar(255)', col => col.defaultTo(null))
    .addColumn('size_bytes',       'bigint',       col => col.defaultTo(0).notNull())
    .addColumn('file_path',        'text',         col => col.notNull())
    .addColumn('created_at',       'timestamptz',  col => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE INDEX IF NOT EXISTS archived_attachments_mail_idx ON archived_attachments(archived_mail_id)`.execute(db)

  // ─── rules ───────────────────────────────────────────────
  await db.schema
    .createTable('rules')
    .ifNotExists()
    .addColumn('id',               'uuid',        col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid',        col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('name',             'varchar(255)',col => col.notNull())
    .addColumn('description',      'text',        col => col.defaultTo(null))
    .addColumn('conditions',       'jsonb',       col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('action',           'jsonb',       col => col.notNull())
    .addColumn('schedule',         'varchar(100)',col => col.defaultTo(null))
    .addColumn('is_active',        'boolean',     col => col.defaultTo(true).notNull())
    .addColumn('last_run_at',      'timestamptz', col => col.defaultTo(null))
    .addColumn('created_at',       'timestamptz', col => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',       'timestamptz', col => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`
    CREATE TRIGGER rules_updated_at BEFORE UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  // ─── jobs ─────────────────────────────────────────────────
  await db.schema
    .createTable('jobs')
    .ifNotExists()
    .addColumn('id',               'uuid',        col => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('bullmq_id',        'varchar(255)',col => col.defaultTo(null))
    .addColumn('type',             'varchar(100)',col => col.notNull())
    .addColumn('status',           'varchar(50)', col => col.defaultTo('pending').notNull())
    .addColumn('progress',         'integer',     col => col.defaultTo(0).notNull())
    .addColumn('total',            'integer',     col => col.defaultTo(0).notNull())
    .addColumn('processed',        'integer',     col => col.defaultTo(0).notNull())
    .addColumn('gmail_account_id', 'uuid',        col => col.references('gmail_accounts.id').onDelete('set null'))
    .addColumn('payload',          'jsonb',       col => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('error',            'text',        col => col.defaultTo(null))
    .addColumn('created_at',       'timestamptz', col => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('completed_at',     'timestamptz', col => col.defaultTo(null))
    .execute()

  await sql`CREATE INDEX IF NOT EXISTS jobs_account_idx    ON jobs(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS jobs_status_idx     ON jobs(status)`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('jobs').ifExists().execute()
  await db.schema.dropTable('rules').ifExists().execute()
  await db.schema.dropTable('archived_attachments').ifExists().execute()
  await db.schema.dropTable('archived_mails').ifExists().execute()
  await db.schema.dropTable('gmail_accounts').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
}
