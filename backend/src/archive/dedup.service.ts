import { createHash } from 'crypto'
import { getDb } from '../db'
import { getStorageForUser } from '../storage/storage.service'
import { sql } from 'kysely'
import { createLogger } from '../logger'

const logger = createLogger('dedup')

/**
 * Statistiques de déduplication des pièces jointes pour un utilisateur.
 */
export async function getDeduplicationStats(userId: string) {
  const db = getDb()

  // Récupérer les comptes Gmail de l'utilisateur
  const accounts = await db
    .selectFrom('gmail_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .execute()

  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) {
    return {
      totalAttachments: 0,
      uniqueFiles: 0,
      duplicateFiles: 0,
      totalSizeBytes: 0,
      deduplicatedSizeBytes: 0,
      savedBytes: 0,
      hashCoverage: 0,
    }
  }

  // Total attachments pour cet utilisateur
  const totalRow = await db
    .selectFrom('archived_attachments')
    .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
    .select((eb) => [
      eb.fn.countAll().as('count'),
      eb.fn.sum('archived_attachments.size_bytes').as('total_size'),
    ])
    .where('archived_mails.gmail_account_id', 'in', accountIds)
    .executeTakeFirstOrThrow() as any

  const totalAttachments = Number(totalRow.count)
  const totalSizeBytes = Number(totalRow.total_size ?? 0)

  // Attachments avec hash
  const hashedCount = await db
    .selectFrom('archived_attachments')
    .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('archived_mails.gmail_account_id', 'in', accountIds)
    .where('archived_attachments.content_hash', 'is not', null)
    .executeTakeFirstOrThrow() as any

  // Hashs uniques (= fichiers uniques stockés)
  const uniqueRow = await db
    .selectFrom('archived_attachments')
    .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
    .select((eb) => eb.fn.count('archived_attachments.content_hash').distinct().as('unique_count'))
    .where('archived_mails.gmail_account_id', 'in', accountIds)
    .where('archived_attachments.content_hash', 'is not', null)
    .executeTakeFirstOrThrow() as any

  // Taille réelle stockée (une seule fois par hash unique)
  const dedupSizeRow = await sql<{ dedup_size: string }>`
    SELECT COALESCE(SUM(sub.size_bytes), 0) AS dedup_size
    FROM (
      SELECT DISTINCT ON (aa.content_hash) aa.size_bytes
      FROM archived_attachments aa
      INNER JOIN archived_mails am ON am.id = aa.archived_mail_id
      WHERE am.gmail_account_id = ANY(${sql.raw(`ARRAY[${accountIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})
      AND aa.content_hash IS NOT NULL
      ORDER BY aa.content_hash, aa.created_at ASC
    ) sub
  `.execute(db)

  const uniqueFiles = Number(uniqueRow.unique_count)
  const deduplicatedSizeBytes = Number(dedupSizeRow.rows[0]?.dedup_size ?? 0)
  const duplicateFiles = Number(hashedCount.count) - uniqueFiles

  return {
    totalAttachments,
    uniqueFiles,
    duplicateFiles,
    totalSizeBytes,
    deduplicatedSizeBytes,
    savedBytes: totalSizeBytes - deduplicatedSizeBytes,
    hashCoverage: totalAttachments > 0 ? Number(hashedCount.count) / totalAttachments : 0,
  }
}

/**
 * Backfill : calculer les hash SHA-256 pour les pièces jointes existantes
 * qui n'ont pas encore de content_hash.
 */
export async function backfillAttachmentHashes(userId: string) {
  logger.info({ userId }, 'backfilling attachment hashes')
  const db = getDb()
  const storage = await getStorageForUser(userId)

  // Récupérer les comptes Gmail de l'utilisateur
  const accounts = await db
    .selectFrom('gmail_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .execute()

  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) return { processed: 0, failed: 0, duplicatesRemoved: 0 }

  // Attachments sans hash
  const attachments = await db
    .selectFrom('archived_attachments')
    .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
    .select([
      'archived_attachments.id',
      'archived_attachments.file_path',
    ])
    .where('archived_mails.gmail_account_id', 'in', accountIds)
    .where('archived_attachments.content_hash', 'is', null)
    .execute()

  let processed = 0
  let failed = 0

  for (const att of attachments) {
    try {
      const exists = await storage.exists(att.file_path)
      if (!exists) {
        failed++
        continue
      }

      const content = await storage.readFile(att.file_path)
      const hash = createHash('sha256').update(content).digest('hex')

      await db
        .updateTable('archived_attachments')
        .set({ content_hash: hash })
        .where('id', '=', att.id)
        .execute()

      processed++
    } catch {
      failed++
    }
  }

  // Après le backfill, supprimer les fichiers dupliqués
  const cleaned = await cleanupDuplicateFiles(userId)

  return { processed, failed, duplicatesRemoved: cleaned }
}

/**
 * Supprime les fichiers en double sur le stockage.
 * Pour chaque hash, garde le premier fichier et fait pointer les autres vers celui-ci.
 */
async function cleanupDuplicateFiles(userId: string) {
  const db = getDb()
  const storage = await getStorageForUser(userId)

  const accounts = await db
    .selectFrom('gmail_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .execute()

  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) return 0

  // Trouver les hash avec plusieurs fichiers différents
  const duplicates = await sql<{ content_hash: string; file_paths: string[] }>`
    SELECT aa.content_hash, array_agg(DISTINCT aa.file_path) AS file_paths
    FROM archived_attachments aa
    INNER JOIN archived_mails am ON am.id = aa.archived_mail_id
    WHERE am.gmail_account_id = ANY(${sql.raw(`ARRAY[${accountIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})
    AND aa.content_hash IS NOT NULL
    GROUP BY aa.content_hash
    HAVING COUNT(DISTINCT aa.file_path) > 1
  `.execute(db)

  let removed = 0

  for (const dup of duplicates.rows) {
    const canonicalPath = dup.file_paths[0]

    // Mettre à jour toutes les entrées pour utiliser le fichier canonique
    await db
      .updateTable('archived_attachments')
      .set({ file_path: canonicalPath })
      .where('content_hash', '=', dup.content_hash)
      .execute()

    // Supprimer les fichiers en double (sauf le canonique)
    for (let i = 1; i < dup.file_paths.length; i++) {
      try {
        await storage.deleteFile(dup.file_paths[i])
        removed++
      } catch {
        // Fichier déjà supprimé ou inaccessible
      }
    }
  }

  return removed
}
