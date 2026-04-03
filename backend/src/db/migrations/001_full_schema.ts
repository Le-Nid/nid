import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // ─── Extensions ───────────────────────────────────────────
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`.execute(db)

  // ─── Trigger function : updated_at auto ──────────────────
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  // ═══════════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('users')
    .addColumn('id',                  'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('email',               'varchar(255)', (col) => col.unique().notNull())
    .addColumn('password_hash',       'varchar(255)')
    .addColumn('role',                'varchar(20)',  (col) => col.defaultTo('user').notNull())
    .addColumn('display_name',        'varchar(255)')
    .addColumn('avatar_url',          'text')
    .addColumn('google_id',           'varchar(255)')
    .addColumn('is_active',           'boolean',      (col) => col.defaultTo(true).notNull())
    .addColumn('max_gmail_accounts',  'integer',      (col) => col.defaultTo(3).notNull())
    .addColumn('storage_quota_bytes', 'bigint',       (col) => col.defaultTo(5_368_709_120).notNull())
    .addColumn('totp_secret',         'varchar(64)')
    .addColumn('totp_enabled',        'boolean',      (col) => col.defaultTo(false).notNull())
    .addColumn('encryption_key_hash', 'varchar')
    .addColumn('last_login_at',       'timestamptz')
    .addColumn('created_at',          'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',          'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  await sql`CREATE UNIQUE INDEX users_google_id_unique ON users(google_id) WHERE google_id IS NOT NULL`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // GMAIL ACCOUNTS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('gmail_accounts')
    .addColumn('id',            'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('user_id',       'uuid',         (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('email',         'varchar(255)', (col) => col.notNull())
    .addColumn('access_token',  'text',         (col) => col.notNull())
    .addColumn('refresh_token', 'text',         (col) => col.notNull())
    .addColumn('token_expiry',  'timestamptz',  (col) => col.notNull())
    .addColumn('is_active',     'boolean',      (col) => col.defaultTo(true).notNull())
    .addColumn('created_at',    'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',    'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addUniqueConstraint('gmail_accounts_user_email_unique', ['user_id', 'email'])
    .execute()

  await sql`
    CREATE TRIGGER gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  // ═══════════════════════════════════════════════════════════
  // ARCHIVED MAILS (includes attachment_names, in_reply_to, references_header)
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('archived_mails')
    .addColumn('id',                'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id',  'uuid',         (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id',  'varchar(255)', (col) => col.notNull())
    .addColumn('thread_id',         'varchar(255)')
    .addColumn('in_reply_to',       'text')
    .addColumn('references_header', 'text')
    .addColumn('subject',           'text')
    .addColumn('sender',            'varchar(500)')
    .addColumn('recipient',         'text')
    .addColumn('date',              'timestamptz')
    .addColumn('size_bytes',        'bigint',       (col) => col.defaultTo(0).notNull())
    .addColumn('has_attachments',   'boolean',      (col) => col.defaultTo(false).notNull())
    .addColumn('label_ids',         sql`text[]`,    (col) => col.defaultTo(sql`'{}'`).notNull())
    .addColumn('eml_path',          'text',         (col) => col.notNull())
    .addColumn('snippet',           'text')
    .addColumn('attachment_names',  'text')
    .addColumn('is_encrypted',      'boolean',      (col) => col.defaultTo(false).notNull())
    .addColumn('search_vector',     sql`tsvector`)
    .addColumn('archived_at',       'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addUniqueConstraint('archived_mails_account_message_unique', ['gmail_account_id', 'gmail_message_id'])
    .execute()

  await sql`CREATE INDEX archived_mails_search_idx  ON archived_mails USING GIN(search_vector)`.execute(db)
  await sql`CREATE INDEX archived_mails_account_idx ON archived_mails(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX archived_mails_sender_idx  ON archived_mails(sender)`.execute(db)
  await sql`CREATE INDEX archived_mails_date_idx    ON archived_mails(date DESC)`.execute(db)
  await sql`CREATE INDEX archived_mails_size_idx    ON archived_mails(size_bytes DESC)`.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_archived_mails_thread_id
    ON archived_mails (gmail_account_id, thread_id)
    WHERE thread_id IS NOT NULL
  `.execute(db)

  // Full-text search trigger (includes attachment_names)
  await sql`
    CREATE OR REPLACE FUNCTION update_mail_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', COALESCE(NEW.subject,          '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(NEW.sender,           '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(NEW.snippet,          '')), 'C') ||
        setweight(to_tsvector('french', COALESCE(NEW.attachment_names, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE TRIGGER mail_search_vector_update
    BEFORE INSERT OR UPDATE ON archived_mails
    FOR EACH ROW EXECUTE FUNCTION update_mail_search_vector()
  `.execute(db)

  // ═══════════════════════════════════════════════════════════
  // ARCHIVED ATTACHMENTS (includes content_hash)
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('archived_attachments')
    .addColumn('id',               'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('archived_mail_id', 'uuid',         (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('filename',         'varchar(500)', (col) => col.notNull())
    .addColumn('mime_type',        'varchar(255)')
    .addColumn('size_bytes',       'bigint',       (col) => col.defaultTo(0).notNull())
    .addColumn('file_path',        'text',         (col) => col.notNull())
    .addColumn('content_hash',     'varchar(64)')
    .addColumn('created_at',       'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE INDEX archived_attachments_mail_idx ON archived_attachments(archived_mail_id)`.execute(db)
  await sql`CREATE INDEX idx_archived_attachments_content_hash ON archived_attachments(content_hash)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // RULES
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('rules')
    .addColumn('id',               'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid',         (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('name',             'varchar(255)', (col) => col.notNull())
    .addColumn('description',      'text')
    .addColumn('conditions',       'jsonb',        (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('action',           'jsonb',        (col) => col.notNull())
    .addColumn('schedule',         'varchar(100)')
    .addColumn('is_active',        'boolean',      (col) => col.defaultTo(true).notNull())
    .addColumn('last_run_at',      'timestamptz')
    .addColumn('created_at',       'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at',       'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`
    CREATE TRIGGER rules_updated_at BEFORE UPDATE ON rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db)

  // ═══════════════════════════════════════════════════════════
  // JOBS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('jobs')
    .addColumn('id',               'uuid',         (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('bullmq_id',        'varchar(255)')
    .addColumn('type',             'varchar(100)', (col) => col.notNull())
    .addColumn('status',           'varchar(50)',  (col) => col.defaultTo('pending').notNull())
    .addColumn('progress',         'integer',      (col) => col.defaultTo(0).notNull())
    .addColumn('total',            'integer',      (col) => col.defaultTo(0).notNull())
    .addColumn('processed',        'integer',      (col) => col.defaultTo(0).notNull())
    .addColumn('gmail_account_id', 'uuid',         (col) => col.references('gmail_accounts.id').onDelete('set null'))
    .addColumn('user_id',          'uuid',         (col) => col.references('users.id').onDelete('set null'))
    .addColumn('payload',          'jsonb',        (col) => col.defaultTo(sql`'{}'::jsonb`).notNull())
    .addColumn('error',            'text')
    .addColumn('created_at',       'timestamptz',  (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('completed_at',     'timestamptz')
    .execute()

  await sql`CREATE INDEX jobs_account_idx    ON jobs(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX jobs_status_idx     ON jobs(status)`.execute(db)
  await sql`CREATE INDEX jobs_created_at_idx ON jobs(created_at DESC)`.execute(db)
  await sql`CREATE INDEX jobs_user_id_idx    ON jobs(user_id)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('notifications')
    .addColumn('id',         'uuid',         (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',    'uuid',         (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type',       'varchar(50)',  (col) => col.notNull())
    .addColumn('title',      'varchar(255)', (col) => col.notNull())
    .addColumn('body',       'text')
    .addColumn('data',       'jsonb')
    .addColumn('is_read',    'boolean',      (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz',  (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`CREATE INDEX notifications_user_id_idx ON notifications(user_id, created_at)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('audit_logs')
    .addColumn('id',          'uuid',         (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',     'uuid',         (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('action',      'varchar(100)', (col) => col.notNull())
    .addColumn('target_type', 'varchar(50)')
    .addColumn('target_id',   'varchar(255)')
    .addColumn('details',     'jsonb')
    .addColumn('ip_address',  'varchar(45)')
    .addColumn('created_at',  'timestamptz',  (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id, created_at)`.execute(db)
  await sql`CREATE INDEX audit_logs_action_idx  ON audit_logs(action, created_at)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // WEBHOOKS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('webhooks')
    .addColumn('id',                'uuid',        (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',           'uuid',        (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('name',              'varchar(100)',(col) => col.notNull())
    .addColumn('url',               'text',        (col) => col.notNull())
    .addColumn('type',              'varchar(20)', (col) => col.notNull().defaultTo('generic'))
    .addColumn('events',            sql`text[]`,   (col) => col.notNull())
    .addColumn('is_active',         'boolean',     (col) => col.defaultTo(true).notNull())
    .addColumn('secret',            'varchar(64)')
    .addColumn('last_triggered_at', 'timestamptz')
    .addColumn('last_status',       'integer')
    .addColumn('created_at',        'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute()

  await sql`CREATE INDEX idx_webhooks_user_id ON webhooks(user_id)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // NOTIFICATION PREFERENCES
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('notification_preferences')
    .addColumn('id',                    'uuid',        (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id',              'uuid',        (col) => col.notNull().references('users.id').onDelete('cascade').unique())
    .addColumn('weekly_report',        'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('job_completed',        'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('job_failed',           'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('rule_executed',        'boolean',     (col) => col.notNull().defaultTo(false))
    .addColumn('quota_warning',        'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('integrity_alert',      'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('weekly_report_toast',  'boolean',     (col) => col.notNull().defaultTo(false))
    .addColumn('job_completed_toast',  'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('job_failed_toast',     'boolean',     (col) => col.notNull().defaultTo(true))
    .addColumn('rule_executed_toast',  'boolean',     (col) => col.notNull().defaultTo(false))
    .addColumn('quota_warning_toast',  'boolean',     (col) => col.notNull().defaultTo(false))
    .addColumn('integrity_alert_toast','boolean',     (col) => col.notNull().defaultTo(false))
    .addColumn('updated_at',          'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // ═══════════════════════════════════════════════════════════
  // TRACKING PIXELS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('tracking_pixels')
    .addColumn('id',                'uuid',      (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id',  'uuid',      (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id',  'varchar',   (col) => col.notNull())
    .addColumn('subject',           'varchar')
    .addColumn('sender',            'varchar')
    .addColumn('date',              'timestamptz')
    .addColumn('trackers',          'jsonb',     (col) => col.notNull().defaultTo('[]'))
    .addColumn('tracker_count',     'integer',   (col) => col.notNull().defaultTo(0))
    .addColumn('scanned_at',        'timestamptz',(col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tracking_pixels_account_message', ['gmail_account_id', 'gmail_message_id'])
    .execute()

  await sql`CREATE INDEX idx_tracking_pixels_account ON tracking_pixels(gmail_account_id)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // PII FINDINGS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('pii_findings')
    .addColumn('id',                'uuid',      (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id',  'uuid',      (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('archived_mail_id',  'uuid',      (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('pii_type',          'varchar',   (col) => col.notNull())
    .addColumn('count',             'integer',   (col) => col.notNull().defaultTo(1))
    .addColumn('snippet',           'varchar')
    .addColumn('scanned_at',        'timestamptz',(col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`CREATE INDEX idx_pii_findings_account ON pii_findings(gmail_account_id)`.execute(db)
  await sql`CREATE INDEX idx_pii_findings_mail    ON pii_findings(archived_mail_id)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS — Heatmap, Sender Scores, Cleanup, Inbox Zero
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('email_activity_heatmap')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('day_of_week', 'integer', (col) => col.notNull())
    .addColumn('hour_of_day', 'integer', (col) => col.notNull())
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE UNIQUE INDEX email_activity_heatmap_unique
    ON email_activity_heatmap(gmail_account_id, day_of_week, hour_of_day)`.execute(db)

  await db.schema
    .createTable('sender_scores')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('sender', 'text', (col) => col.notNull())
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('total_size_bytes', 'bigint', (col) => col.defaultTo(0).notNull())
    .addColumn('unread_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('has_unsubscribe', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('read_rate', 'real', (col) => col.defaultTo(0).notNull())
    .addColumn('clutter_score', 'real', (col) => col.defaultTo(0).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE UNIQUE INDEX sender_scores_unique
    ON sender_scores(gmail_account_id, sender)`.execute(db)

  await db.schema
    .createTable('cleanup_suggestions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('type', 'varchar(50)', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('sender', 'text')
    .addColumn('email_count', 'integer', (col) => col.defaultTo(0).notNull())
    .addColumn('total_size_bytes', 'bigint', (col) => col.defaultTo(0).notNull())
    .addColumn('query', 'text')
    .addColumn('is_dismissed', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('computed_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await db.schema
    .createTable('inbox_zero_snapshots')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('inbox_count', 'integer', (col) => col.notNull())
    .addColumn('unread_count', 'integer', (col) => col.notNull())
    .addColumn('recorded_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute()

  await sql`CREATE INDEX inbox_zero_snapshots_account_date
    ON inbox_zero_snapshots(gmail_account_id, recorded_at DESC)`.execute(db)

  // ═══════════════════════════════════════════════════════════
  // SOCIAL ACCOUNTS
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('user_social_accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`uuid_generate_v4()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'varchar(50)', (col) => col.notNull())
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

  // ═══════════════════════════════════════════════════════════
  // SAVED SEARCHES
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('saved_searches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('query', 'text', (col) => col.notNull())
    .addColumn('icon', 'varchar(64)')
    .addColumn('color', 'varchar(32)')
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_saved_searches_user_id')
    .on('saved_searches')
    .column('user_id')
    .execute()

  // ═══════════════════════════════════════════════════════════
  // OPS & RÉSILIENCE — Retention, API Usage, Storage
  // ═══════════════════════════════════════════════════════════
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

  await sql`
    CREATE INDEX idx_gmail_api_usage_recorded_at ON gmail_api_usage (recorded_at)
  `.execute(db)

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

  // ═══════════════════════════════════════════════════════════
  // EXPIRATION & SHARING
  // ═══════════════════════════════════════════════════════════
  await db.schema
    .createTable('email_expirations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('gmail_account_id', 'uuid', (col) => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('gmail_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('subject', 'text')
    .addColumn('sender', 'text')
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('category', 'varchar(50)', (col) => col.notNull().defaultTo('manual'))
    .addColumn('is_deleted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_email_expirations_account')
    .on('email_expirations')
    .column('gmail_account_id')
    .execute()

  await db.schema
    .createIndex('idx_email_expirations_expires_at')
    .on('email_expirations')
    .column('expires_at')
    .execute()

  await sql`
    CREATE UNIQUE INDEX idx_email_expirations_unique
    ON email_expirations (gmail_account_id, gmail_message_id)
    WHERE is_deleted = false
  `.execute(db)

  await db.schema
    .createTable('archive_shares')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('archived_mail_id', 'uuid', (col) => col.notNull().references('archived_mails.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('access_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_access', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_token')
    .on('archive_shares')
    .column('token')
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_mail')
    .on('archive_shares')
    .column('archived_mail_id')
    .execute()

  await db.schema
    .createIndex('idx_archive_shares_expires_at')
    .on('archive_shares')
    .column('expires_at')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('archive_shares').ifExists().execute()
  await db.schema.dropTable('email_expirations').ifExists().execute()
  await db.schema.dropTable('storage_configs').ifExists().execute()
  await db.schema.dropTable('gmail_api_usage').ifExists().execute()
  await db.schema.dropTable('retention_policies').ifExists().execute()
  await db.schema.dropTable('saved_searches').ifExists().execute()
  await db.schema.dropTable('user_social_accounts').ifExists().execute()
  await db.schema.dropTable('inbox_zero_snapshots').ifExists().execute()
  await db.schema.dropTable('cleanup_suggestions').ifExists().execute()
  await db.schema.dropTable('sender_scores').ifExists().execute()
  await db.schema.dropTable('email_activity_heatmap').ifExists().execute()
  await db.schema.dropTable('pii_findings').ifExists().execute()
  await db.schema.dropTable('tracking_pixels').ifExists().execute()
  await db.schema.dropTable('notification_preferences').ifExists().execute()
  await db.schema.dropTable('webhooks').ifExists().execute()
  await db.schema.dropTable('audit_logs').ifExists().execute()
  await db.schema.dropTable('notifications').ifExists().execute()
  await db.schema.dropTable('jobs').ifExists().execute()
  await db.schema.dropTable('rules').ifExists().execute()
  await db.schema.dropTable('archived_attachments').ifExists().execute()
  await db.schema.dropTable('archived_mails').ifExists().execute()
  await db.schema.dropTable('gmail_accounts').ifExists().execute()
  await db.schema.dropTable('users').ifExists().execute()
  await sql`DROP FUNCTION IF EXISTS update_updated_at()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS update_mail_search_vector()`.execute(db)
}
