import { Kysely, sql } from 'kysely'

// O7 (design/ui-redesign.md §10): the PII and tracking-pixel scans are gone from the UI and the API; their
// results go with them. down() restores the empty tables (schema of 001) only: the purged rows are not recoverable.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pii_findings').ifExists().execute()
  await db.schema.dropTable('tracking_pixels').ifExists().execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE tracking_pixels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      gmail_account_id uuid NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
      gmail_message_id varchar NOT NULL,
      subject varchar, sender varchar, date timestamptz,
      trackers jsonb NOT NULL DEFAULT '[]', tracker_count integer NOT NULL DEFAULT 0,
      scanned_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tracking_pixels_account_message UNIQUE (gmail_account_id, gmail_message_id)
    );
    CREATE INDEX idx_tracking_pixels_account ON tracking_pixels(gmail_account_id);
    CREATE TABLE pii_findings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      gmail_account_id uuid NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
      archived_mail_id uuid NOT NULL REFERENCES archived_mails(id) ON DELETE CASCADE,
      pii_type varchar NOT NULL, count integer NOT NULL DEFAULT 1, snippet varchar,
      scanned_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_pii_findings_account ON pii_findings(gmail_account_id);
    CREATE INDEX idx_pii_findings_mail ON pii_findings(archived_mail_id);
  `.execute(db)
}
