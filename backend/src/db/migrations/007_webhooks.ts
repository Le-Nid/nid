import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('webhooks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.references('users.id').onDelete('cascade').notNull())
    .addColumn('name', 'varchar(100)', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('type', 'varchar(20)', (col) => col.notNull().defaultTo('generic'))
    .addColumn('events', sql`text[]`, (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true).notNull())
    .addColumn('secret', 'varchar(64)')
    .addColumn('last_triggered_at', 'timestamptz')
    .addColumn('last_status', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`).notNull())
    .execute()

  await db.schema
    .createIndex('idx_webhooks_user_id')
    .on('webhooks')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('webhooks').execute()
}
