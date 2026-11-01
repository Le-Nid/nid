import { Kysely, sql } from 'kysely'

// The heatmap is computed from archived_mails on each call: its Gmail-sampled cache table goes (derived data only)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('email_activity_heatmap').ifExists().execute()
}

// Back to the empty table as 015 left it (account_id), so 015's down can still rename its column
export async function down(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE email_activity_heatmap (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id uuid NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
    day_of_week integer NOT NULL, hour_of_day integer NOT NULL,
    email_count integer NOT NULL DEFAULT 0, computed_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT email_activity_heatmap_unique UNIQUE (account_id, day_of_week, hour_of_day)
  )`.execute(db)
}
