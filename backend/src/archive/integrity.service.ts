import { getDb } from '../db'
import { config } from '../config'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../logger'

const logger = createLogger('integrity')

export interface IntegrityResult {
  totalRecords: number
  checkedFiles: number
  missingFiles: string[]
  orphanedFiles: string[]
  corruptedFiles: string[]
  healthy: boolean
}

export async function checkArchiveIntegrity(accountId?: string): Promise<IntegrityResult> {
  logger.info({ accountId: accountId ?? 'all' }, 'checking archive integrity')
  const db = getDb()

  // 1. Get all archived mails from DB
  let query = db
    .selectFrom('archived_mails')
    .select(['id', 'eml_path', 'gmail_account_id', 'size_bytes'])

  if (accountId) {
    query = query.where('gmail_account_id', '=', accountId)
  }

  const records = await query.execute()

  const missingFiles: string[] = []
  const corruptedFiles: string[] = []
  const dbPaths = new Set<string>()

  // 2. Check each DB record has a corresponding file
  for (const record of records) {
    const fullPath = path.resolve(config.ARCHIVE_PATH, record.eml_path)
    dbPaths.add(fullPath)

    try {
      const stat = await fs.promises.stat(fullPath)
      // Check if file is empty (likely corrupt)
      if (stat.size === 0) {
        corruptedFiles.push(record.eml_path)
      }
    } catch {
      missingFiles.push(record.eml_path)
    }
  }

  // 3. Check for orphaned files (on disk but not in DB)
  const orphanedFiles: string[] = []
  const archiveDir = config.ARCHIVE_PATH
  // Archives live under ARCHIVE_PATH/<accountId>/…
  const scanDir = accountId ? path.join(archiveDir, accountId) : archiveDir

  try {
    const entries = await fs.promises.readdir(scanDir, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.eml')) continue
      const full = path.join(entry.parentPath, entry.name)
      if (!dbPaths.has(full)) orphanedFiles.push(path.relative(archiveDir, full))
    }
  } catch {
    // directory doesn't exist or not readable
  }

  const result = {
    totalRecords: records.length,
    checkedFiles: records.length,
    missingFiles,
    orphanedFiles,
    corruptedFiles,
    healthy: missingFiles.length === 0 && corruptedFiles.length === 0,
  }

  logger.info(
    { totalRecords: result.totalRecords, missing: missingFiles.length, orphaned: orphanedFiles.length, corrupted: corruptedFiles.length, healthy: result.healthy },
    'integrity check completed',
  )

  return result
}
