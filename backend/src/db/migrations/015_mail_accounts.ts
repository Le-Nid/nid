import { Kysely, sql } from 'kysely'

// Accounts are no longer Gmail-only (IMAP next): gmail_accounts → mail_accounts, gmail_account_id → account_id
const TABLES = [
  'archived_mails', 'rules', 'jobs', 'newsletter_scans', 'email_activity_heatmap', 'sender_scores',
  'cleanup_suggestions', 'inbox_zero_snapshots', 'gmail_labels', 'retention_policies', 'gmail_api_usage', 'email_expirations',
]

async function rename(db: Kysely<any>, from: { table: string; column: string; unique: string }, to: typeof from) {
  await sql`ALTER TABLE ${sql.table(from.table)} RENAME TO ${sql.table(to.table)}`.execute(db)
  await sql`ALTER TABLE ${sql.table(to.table)} RENAME CONSTRAINT ${sql.id(from.unique)} TO ${sql.id(to.unique)}`.execute(db)
  for (const table of TABLES) {
    await sql`ALTER TABLE ${sql.table(table)} RENAME COLUMN ${sql.id(from.column)} TO ${sql.id(to.column)}`.execute(db)
  }
}

const OLD = { table: 'gmail_accounts', column: 'gmail_account_id', unique: 'gmail_accounts_user_email_unique' }
const NEW = { table: 'mail_accounts', column: 'account_id', unique: 'mail_accounts_user_email_unique' }

export async function up(db: Kysely<any>): Promise<void> {
  await rename(db, OLD, NEW)
}

export async function down(db: Kysely<any>): Promise<void> {
  await rename(db, NEW, OLD)
}
