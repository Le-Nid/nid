import { Kysely } from 'kysely'

// B8: a rule created from a template remembers it, so from-template stays idempotent per account
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('rules').addColumn('template_id', 'text').execute()
  await db.schema
    .createIndex('rules_account_template_uniq')
    .on('rules')
    .columns(['gmail_account_id', 'template_id'])
    .unique()
    .where('template_id', 'is not', null)
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('rules_account_template_uniq').ifExists().execute()
  await db.schema.alterTable('rules').dropColumn('template_id').execute()
}
