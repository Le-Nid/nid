import { ColumnType, Generated, Selectable, Insertable, Updateable } from 'kysely'

// ─── Helpers ──────────────────────────────────────────────
// ColumnType<SelectType, InsertType, UpdateType>

export type Timestamp = ColumnType<Date, Date | string, Date | string>
export type JsonbValue = ColumnType<unknown, string, string>

// ─── Tables ───────────────────────────────────────────────

export interface UsersTable {
  id:            Generated<string>
  email:         string
  password_hash: string
  created_at:    Generated<Date>
  updated_at:    Generated<Date>
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
  payload:          ColumnType<unknown, string, string>
  error:            string | null
  created_at:       Generated<Date>
  completed_at:     Date | null
}

// ─── Database interface ───────────────────────────────────

export interface Database {
  users:                UsersTable
  gmail_accounts:       GmailAccountsTable
  archived_mails:       ArchivedMailsTable
  archived_attachments: ArchivedAttachmentsTable
  rules:                RulesTable
  jobs:                 JobsTable
}

// ─── Row types (Selectable = what you get back from SELECT) ─

export type User               = Selectable<UsersTable>
export type GmailAccount       = Selectable<GmailAccountsTable>
export type ArchivedMail       = Selectable<ArchivedMailsTable>
export type ArchivedAttachment = Selectable<ArchivedAttachmentsTable>
export type Rule               = Selectable<RulesTable>
export type Job                = Selectable<JobsTable>

export type NewUser               = Insertable<UsersTable>
export type NewGmailAccount       = Insertable<GmailAccountsTable>
export type NewArchivedMail       = Insertable<ArchivedMailsTable>
export type NewArchivedAttachment = Insertable<ArchivedAttachmentsTable>
export type NewRule               = Insertable<RulesTable>
export type NewJob                = Insertable<JobsTable>
