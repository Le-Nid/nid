-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text trigram search

-- ─── Users ────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Gmail Accounts ───────────────────────────────────
CREATE TABLE gmail_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expiry    TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, email)
);

-- ─── Archived Mails ───────────────────────────────────
CREATE TABLE archived_mails (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gmail_account_id    UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  gmail_message_id    VARCHAR(255) NOT NULL,
  thread_id           VARCHAR(255),
  subject             TEXT,
  sender              VARCHAR(500),
  recipient           TEXT,
  date                TIMESTAMPTZ,
  size_bytes          BIGINT DEFAULT 0,
  has_attachments     BOOLEAN DEFAULT FALSE,
  label_ids           TEXT[] DEFAULT '{}',
  eml_path            TEXT NOT NULL,
  snippet             TEXT,
  archived_at         TIMESTAMPTZ DEFAULT NOW(),
  search_vector       TSVECTOR,
  UNIQUE (gmail_account_id, gmail_message_id)
);

-- Full-text search index
CREATE INDEX archived_mails_search_idx ON archived_mails USING GIN(search_vector);
CREATE INDEX archived_mails_account_idx ON archived_mails(gmail_account_id);
CREATE INDEX archived_mails_sender_idx ON archived_mails(sender);
CREATE INDEX archived_mails_date_idx ON archived_mails(date DESC);
CREATE INDEX archived_mails_size_idx ON archived_mails(size_bytes DESC);

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION update_mail_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(NEW.sender, '')), 'B') ||
    setweight(to_tsvector('french', COALESCE(NEW.snippet, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mail_search_vector_update
  BEFORE INSERT OR UPDATE ON archived_mails
  FOR EACH ROW EXECUTE FUNCTION update_mail_search_vector();

-- ─── Archived Attachments ─────────────────────────────
CREATE TABLE archived_attachments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  archived_mail_id  UUID NOT NULL REFERENCES archived_mails(id) ON DELETE CASCADE,
  filename          VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(255),
  size_bytes        BIGINT DEFAULT 0,
  file_path         TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX archived_attachments_mail_idx ON archived_attachments(archived_mail_id);

-- ─── Rules ────────────────────────────────────────────
CREATE TABLE rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gmail_account_id  UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  conditions        JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"field": "from", "operator": "contains", "value": "newsletter@"}]
  action            JSONB NOT NULL,
  -- Example: {"type": "trash"} | {"type": "label", "labelId": "..."} | {"type": "archive"}
  schedule          VARCHAR(100),  -- cron string, null = manual only
  is_active         BOOLEAN DEFAULT TRUE,
  last_run_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Jobs ─────────────────────────────────────────────
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bullmq_id         VARCHAR(255),  -- BullMQ job id for correlation
  type              VARCHAR(100) NOT NULL,
  -- Types: bulk_delete | bulk_label | bulk_archive | run_rule | sync_dashboard
  status            VARCHAR(50) DEFAULT 'pending',
  -- pending | active | completed | failed | cancelled
  progress          INTEGER DEFAULT 0,  -- 0-100
  total             INTEGER DEFAULT 0,  -- total items to process
  processed         INTEGER DEFAULT 0,  -- items processed so far
  gmail_account_id  UUID REFERENCES gmail_accounts(id) ON DELETE SET NULL,
  payload           JSONB DEFAULT '{}',
  error             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX jobs_account_idx ON jobs(gmail_account_id);
CREATE INDEX jobs_status_idx ON jobs(status);
CREATE INDEX jobs_created_at_idx ON jobs(created_at DESC);

-- ─── Seed / helpers ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER rules_updated_at BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
