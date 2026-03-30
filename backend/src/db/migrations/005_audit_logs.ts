import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('audit_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('action', 'varchar(100)', (col) => col.notNull())
    .addColumn('target_type', 'varchar(50)')
    .addColumn('target_id', 'varchar(255)')
    .addColumn('details', 'jsonb')
    .addColumn('ip_address', 'varchar(45)')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('audit_logs_user_id_idx')
    .on('audit_logs')
    .columns(['user_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('audit_logs_action_idx')
    .on('audit_logs')
    .columns(['action', 'created_at'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('audit_logs').ifExists().execute()
}
