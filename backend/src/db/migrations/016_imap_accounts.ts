import { Kysely, sql } from 'kysely'

// IMAP accounts (archive only): connection settings on mail_accounts, the password sealed (utils/secret.ts);
// imap_folder_state remembers, per folder, the UIDVALIDITY and the last UID already archived (incremental sync)
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('mail_accounts')
    .addColumn('provider', 'varchar(8)', (col) => col.notNull().defaultTo('gmail').check(sql`provider IN ('gmail', 'imap')`))
    .addColumn('imap_host', 'varchar(255)')
    .addColumn('imap_port', 'integer')
    .addColumn('imap_secure', 'boolean')
    .addColumn('imap_user', 'varchar(255)')
    .addColumn('imap_password', 'text')
    .execute()
  await db.schema.alterTable('mail_accounts').alterColumn('token_expiry', (c) => c.dropNotNull()).execute()
  await db.schema
    .createTable('imap_folder_state')
    .addColumn('account_id',   'uuid',   (col) => col.notNull().references('mail_accounts.id').onDelete('cascade'))
    .addColumn('folder',       'text',   (col) => col.notNull())
    .addColumn('uid_validity', 'bigint', (col) => col.notNull())
    .addColumn('last_uid',     'bigint', (col) => col.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('imap_folder_state_pkey', ['account_id', 'folder'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('imap_folder_state').ifExists().execute()
  await sql`DELETE FROM mail_accounts WHERE provider = 'imap'`.execute(db)
  await db.schema.alterTable('mail_accounts').alterColumn('token_expiry', (c) => c.setNotNull()).execute()
  await db.schema.alterTable('mail_accounts')
    .dropColumn('provider').dropColumn('imap_host').dropColumn('imap_port').dropColumn('imap_secure')
    .dropColumn('imap_user').dropColumn('imap_password')
    .execute()
}
