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
  encryption_key_hash: string | null
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
  in_reply_to:      string | null
  references_header: string | null
  subject:          string | null
  sender:           string | null
  recipient:        string | null
  date:             Timestamp | null
  size_bytes:       Generated<bigint>
  has_attachments:  Generated<boolean>
  label_ids:        Generated<string[]>
  eml_path:         string
  snippet:          string | null
  attachment_names: string | null
  is_encrypted:     Generated<boolean>
  // tsvector — généré par trigger, jamais écrit directement
  search_vector:    ColumnType<string, never, never> | null
  archived_at:      Generated<Date>
  deleted_at:       Date | null
}

export interface ArchivedAttachmentsTable {
  id:               Generated<string>
  archived_mail_id: string
  filename:         string
  mime_type:        string | null
  size_bytes:       Generated<bigint>
  file_path:        string
  content_hash:     string | null
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
  auth_user:         string | null
  auth_password:     string | null
  last_triggered_at: Date | null
  last_status:       number | null
  created_at:        Generated<Date>
}

export interface NotificationPreferencesTable {
  id:              Generated<string>
  user_id:         string
  weekly_report:   Generated<boolean>
  job_completed:   Generated<boolean>
  job_failed:      Generated<boolean>
  rule_executed:   Generated<boolean>
  quota_warning:   Generated<boolean>
  integrity_alert: Generated<boolean>
  weekly_report_toast:   Generated<boolean>
  job_completed_toast:   Generated<boolean>
  job_failed_toast:      Generated<boolean>
  rule_executed_toast:   Generated<boolean>
  quota_warning_toast:   Generated<boolean>
  integrity_alert_toast: Generated<boolean>
  updated_at:      Generated<Date>
}

export interface TrackingPixelsTable {
  id:                Generated<string>
  gmail_account_id:  string
  gmail_message_id:  string
  subject:           string | null
  sender:            string | null
  date:              Timestamp | null
  trackers:          ColumnType<unknown, string, string>
  tracker_count:     Generated<number>
  scanned_at:        Generated<Date>
}

export interface PiiFindingsTable {
  id:                Generated<string>
  gmail_account_id:  string
  archived_mail_id:  string
  pii_type:          string
  count:             Generated<number>
  snippet:           string | null
  scanned_at:        Generated<Date>
}

// ─── Analytics tables ─────────────────────────────────────

export interface EmailActivityHeatmapTable {
  id:               Generated<string>
  gmail_account_id: string
  day_of_week:      number      // 0=lundi … 6=dimanche
  hour_of_day:      number      // 0-23
  email_count:      Generated<number>
  computed_at:      Generated<Date>
}

export interface SenderScoresTable {
  id:               Generated<string>
  gmail_account_id: string
  sender:           string
  email_count:      Generated<number>
  total_size_bytes: Generated<bigint>
  unread_count:     Generated<number>
  has_unsubscribe:  Generated<boolean>
  read_rate:        Generated<number>   // 0.0 - 1.0
  clutter_score:    Generated<number>   // 0-100
  computed_at:      Generated<Date>
}

export interface CleanupSuggestionsTable {
  id:               Generated<string>
  gmail_account_id: string
  type:             string      // 'bulk_unread' | 'large_sender' | 'old_newsletters' | 'duplicate_pattern'
  title:            string
  description:      string | null
  sender:           string | null
  email_count:      Generated<number>
  total_size_bytes: Generated<bigint>
  query:            string | null
  is_dismissed:     Generated<boolean>
  computed_at:      Generated<Date>
}

export interface InboxZeroSnapshotsTable {
  id:               Generated<string>
  gmail_account_id: string
  inbox_count:      number
  unread_count:     number
  recorded_at:      Generated<Date>
}

export interface UserSocialAccountsTable {
  id:           Generated<string>
  user_id:      string
  provider:     string    // 'google' | 'github' | 'discord' | 'microsoft'
  provider_id:  string
  email:        string | null
  display_name: string | null
  avatar_url:   string | null
  created_at:   Generated<Date>
}

export interface SavedSearchesTable {
  id:         Generated<string>
  user_id:    string
  name:       string
  query:      string
  icon:       string | null
  color:      string | null
  sort_order: Generated<number>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

// ─── Ops & Résilience tables ──────────────────────────────

export interface SystemConfigTable {
  key:        string
  value:      ColumnType<unknown, string, string>
  updated_at: Generated<Date>
}

export interface RetentionPoliciesTable {
  id:               Generated<string>
  user_id:          string
  gmail_account_id: string | null
  name:             string
  label:            string | null
  max_age_days:     number
  is_active:        Generated<boolean>
  last_run_at:      Date | null
  deleted_count:    Generated<number>
  created_at:       Generated<Date>
  updated_at:       Generated<Date>
}

export interface GmailApiUsageTable {
  id:               Generated<string>
  gmail_account_id: string
  endpoint:         string
  quota_units:      Generated<number>
  recorded_at:      Generated<Date>
}

export interface StorageConfigsTable {
  id:                   Generated<string>
  user_id:              string
  type:                 Generated<string>  // 'local' | 's3'
  s3_endpoint:          string | null
  s3_region:            string | null
  s3_bucket:            string | null
  s3_access_key_id:     string | null
  s3_secret_access_key: string | null
  s3_force_path_style:  Generated<boolean>
  created_at:           Generated<Date>
  updated_at:           Generated<Date>
}

// ─── Expiration & Sharing tables ──────────────────────────

export interface EmailExpirationsTable {
  id:               Generated<string>
  gmail_account_id: string
  gmail_message_id: string
  subject:          string | null
  sender:           string | null
  expires_at:       Timestamp
  category:         Generated<string>   // 'manual' | 'otp' | 'delivery' | 'promo'
  is_deleted:       Generated<boolean>
  deleted_at:       Date | null
  created_at:       Generated<Date>
}

export interface ArchiveSharesTable {
  id:               Generated<string>
  archived_mail_id: string
  user_id:          string
  token:            string
  expires_at:       Timestamp
  access_count:     Generated<number>
  max_access:       number | null
  created_at:       Generated<Date>
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
  notification_preferences: NotificationPreferencesTable
  tracking_pixels:     TrackingPixelsTable
  pii_findings:        PiiFindingsTable
  email_activity_heatmap: EmailActivityHeatmapTable
  sender_scores:       SenderScoresTable
  cleanup_suggestions: CleanupSuggestionsTable
  inbox_zero_snapshots: InboxZeroSnapshotsTable
  user_social_accounts: UserSocialAccountsTable
  saved_searches:       SavedSearchesTable
  retention_policies:   RetentionPoliciesTable
  system_config:        SystemConfigTable
  gmail_api_usage:      GmailApiUsageTable
  storage_configs:      StorageConfigsTable
  email_expirations:    EmailExpirationsTable
  archive_shares:       ArchiveSharesTable
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
export type NotificationPreference = Selectable<NotificationPreferencesTable>

export type TrackingPixel    = Selectable<TrackingPixelsTable>
export type NewTrackingPixel = Insertable<TrackingPixelsTable>
export type PiiFinding       = Selectable<PiiFindingsTable>
export type NewPiiFinding    = Insertable<PiiFindingsTable>

export type RetentionPolicy    = Selectable<RetentionPoliciesTable>
export type NewRetentionPolicy = Insertable<RetentionPoliciesTable>
export type GmailApiUsage      = Selectable<GmailApiUsageTable>
export type NewGmailApiUsage   = Insertable<GmailApiUsageTable>
export type StorageConfig      = Selectable<StorageConfigsTable>
export type NewStorageConfig   = Insertable<StorageConfigsTable>

export type EmailActivityHeatmap    = Selectable<EmailActivityHeatmapTable>
export type SenderScore             = Selectable<SenderScoresTable>
export type CleanupSuggestion       = Selectable<CleanupSuggestionsTable>
export type InboxZeroSnapshot       = Selectable<InboxZeroSnapshotsTable>

export type UserSocialAccount    = Selectable<UserSocialAccountsTable>
export type NewUserSocialAccount = Insertable<UserSocialAccountsTable>

export type SavedSearch    = Selectable<SavedSearchesTable>
export type NewSavedSearch = Insertable<SavedSearchesTable>

export type EmailExpiration    = Selectable<EmailExpirationsTable>
export type NewEmailExpiration = Insertable<EmailExpirationsTable>
export type ArchiveShare       = Selectable<ArchiveSharesTable>
export type NewArchiveShare    = Insertable<ArchiveSharesTable>
