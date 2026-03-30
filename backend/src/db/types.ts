import { ColumnType, Generated, Selectable, Insertable, Updateable } from 'kysely'

// ─── Helpers ──────────────────────────────────────────────
// ColumnType<SelectType, InsertType, UpdateType>

export type Timestamp = ColumnType<Date, Date | string, Date | string>
export type JsonbValue = ColumnType<unknown, string, string>

// ─── Tables ───────────────────────────────────────────────

export interface UsersTable {
  id:                  Generated<string>
  email:               string
  password_hash:       string | null
  role:                Generated<string>   // 'admin' | 'user'
  display_name:        string | null
  avatar_url:          string | null
  google_id:           string | null
  is_active:           Generated<boolean>
  max_gmail_accounts:  Generated<number>
  storage_quota_bytes: Generated<bigint>   // 5 Go par défaut
  totp_secret:         string | null
  totp_enabled:        Generated<boolean>
  last_login_at:       Date | null
  created_at:          Generated<Date>
  updated_at:          Generated<Date>
}

export interface GmailAccountsTable {
  id:            Generated<string>
  user_id:       string
  email:         string
  access_token:  string
  refresh_token: string
  token_expiry:  Timestamp
  is_active:     Generated<boolean>
  created_at:    Generated<Date>
  updated_at:    Generated<Date>
}

export interface ArchivedMailsTable {
  id:               Generated<string>
  gmail_account_id: string
  gmail_message_id: string
  thread_id:        string | null
  subject:          string | null
  sender:           string | null
  recipient:        string | null
  date:             Timestamp | null
  size_bytes:       Generated<bigint>
  has_attachments:  Generated<boolean>
  label_ids:        Generated<string[]>
  eml_path:         string
  snippet:          string | null
  // tsvector — généré par trigger, jamais écrit directement
  search_vector:    ColumnType<string, never, never> | null
  archived_at:      Generated<Date>
}

export interface ArchivedAttachmentsTable {
  id:               Generated<string>
  archived_mail_id: string
  filename:         string
  mime_type:        string | null
  size_bytes:       Generated<bigint>
  file_path:        string
  created_at:       Generated<Date>
}

export interface RulesTable {
  id:               Generated<string>
  gmail_account_id: string
  name:             string
  description:      string | null
  // JSONB — on stocke en JSON stringifié, on lit comme unknown
  conditions:       ColumnType<unknown, string, string>
  action:           ColumnType<unknown, string, string>
  schedule:         string | null
  is_active:        Generated<boolean>
  last_run_at:      Date | null
  created_at:       Generated<Date>
  updated_at:       Generated<Date>
}

export interface JobsTable {
  id:               Generated<string>
  bullmq_id:        string | null
  type:             string
  status:           Generated<string>
  progress:         Generated<number>
  total:            Generated<number>
  processed:        Generated<number>
  gmail_account_id: string | null
  user_id:          string | null
  payload:          ColumnType<unknown, string, string>
  error:            string | null
  created_at:       Generated<Date>
  completed_at:     Date | null
}

export interface NotificationsTable {
  id:         Generated<string>
  user_id:    string
  type:       string
  title:      string
  body:       string | null
  data:       ColumnType<unknown, string, string> | null
  is_read:    Generated<boolean>
  created_at: Generated<Date>
}

export interface AuditLogsTable {
  id:          Generated<string>
  user_id:     string
  action:      string
  target_type: string | null
  target_id:   string | null
  details:     ColumnType<unknown, string, string> | null
  ip_address:  string | null
  created_at:  Generated<Date>
}

export interface WebhooksTable {
  id:                Generated<string>
  user_id:           string
  name:              string
  url:               string
  type:              Generated<string>   // 'generic' | 'discord' | 'slack' | 'ntfy'
  events:            string[]
  is_active:         Generated<boolean>
  secret:            string | null
  last_triggered_at: Date | null
  last_status:       number | null
  created_at:        Generated<Date>
}

// ─── Database interface ───────────────────────────────────

export interface Database {
  users:                UsersTable
  gmail_accounts:       GmailAccountsTable
  archived_mails:       ArchivedMailsTable
  archived_attachments: ArchivedAttachmentsTable
  rules:                RulesTable
  jobs:                 JobsTable
  notifications:        NotificationsTable
  audit_logs:           AuditLogsTable
  webhooks:             WebhooksTable
}

// ─── Row types (Selectable = what you get back from SELECT) ─

export type User               = Selectable<UsersTable>
export type GmailAccount       = Selectable<GmailAccountsTable>
export type ArchivedMail       = Selectable<ArchivedMailsTable>
export type ArchivedAttachment = Selectable<ArchivedAttachmentsTable>
export type Rule               = Selectable<RulesTable>
export type Job                = Selectable<JobsTable>
export type Notification       = Selectable<NotificationsTable>
export type AuditLog           = Selectable<AuditLogsTable>
export type Webhook            = Selectable<WebhooksTable>

export type NewUser               = Insertable<UsersTable>
export type NewGmailAccount       = Insertable<GmailAccountsTable>
export type NewArchivedMail       = Insertable<ArchivedMailsTable>
export type NewArchivedAttachment = Insertable<ArchivedAttachmentsTable>
export type NewRule               = Insertable<RulesTable>
export type NewJob                = Insertable<JobsTable>
export type NewNotification       = Insertable<NotificationsTable>
export type NewAuditLog           = Insertable<AuditLogsTable>
export type NewWebhook            = Insertable<WebhooksTable>
