import { Kysely, sql } from 'kysely'

// What an IMAP account's backup covers: chosen folders (NULL: every folder but junk, trash and All Mail)
// and a start date (NULL: everything), both set in the account's settings
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('mail_accounts')
    .addColumn('imap_folders', sql`text[]`)
    .addColumn('imap_since', 'date')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('mail_accounts').dropColumn('imap_folders').dropColumn('imap_since').execute()
}
