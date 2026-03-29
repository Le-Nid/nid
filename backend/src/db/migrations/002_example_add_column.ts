import { Kysely } from 'kysely'

/**
 * Exemple de migration pour ajouter une colonne à une table existante.
 * Duplique ce fichier, incrémente le numéro (003, 004…),
 * puis enregistre-le dans backend/src/db/index.ts → migrations.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Exemple : ajouter une colonne notes aux règles
  await db.schema
    .alterTable('rules')
    .addColumn('notes', 'text', (col) => col.defaultTo(null))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('rules')
    .dropColumn('notes')
    .execute()
}
