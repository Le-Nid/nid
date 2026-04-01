import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Ajouter content_hash pour la déduplication par contenu
  await db.schema
    .alterTable('archived_attachments')
    .addColumn('content_hash', 'varchar(64)')
    .execute()

  // Index pour recherche rapide par hash
  await db.schema
    .createIndex('idx_archived_attachments_content_hash')
    .on('archived_attachments')
    .column('content_hash')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('archived_attachments')
    .dropColumn('content_hash')
    .execute()
}
