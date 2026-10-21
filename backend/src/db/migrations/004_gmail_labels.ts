import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Per-account mirror of Gmail labels; rows are soft-deleted so archives keep showing names
  await db.schema
    .createTable('gmail_labels')
    .addColumn('gmail_account_id', 'uuid', (col) =>
      col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('id', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('color_bg', 'varchar(16)')
    .addColumn('color_text', 'varchar(16)')
    .addColumn('type', 'varchar(16)', (col) =>
      col.notNull().check(sql`type IN ('system', 'user', 'category', 'imported')`))
    .addColumn('messages_total', 'integer')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addPrimaryKeyConstraint('gmail_labels_pkey', ['gmail_account_id', 'id'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('gmail_labels').ifExists().execute()
}
