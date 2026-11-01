import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('encryption')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT_LENGTH = 32
// Magic bytes to identify encrypted files
const MAGIC = Buffer.from('GMENC01')

/**
 * Derive an AES-256 key from a user-provided passphrase using PBKDF2.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, 100_000, KEY_LENGTH, 'sha512')
}

/**
 * Verify a passphrase against its stored hash.
 */
export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = crypto.scryptSync(passphrase, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
}

/**
 * Decrypt a file and return its content (does not modify the file on disk).
 */
export async function decryptFile(filePath: string, passphrase: string): Promise<Buffer> {
  const data = await fs.readFile(filePath)

  // Check magic bytes
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    // Not encrypted, return as-is
    return data
  }

  let offset = MAGIC.length
  const salt = data.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH
  const iv = data.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH
  const tag = data.subarray(offset, offset + TAG_LENGTH); offset += TAG_LENGTH
  const ciphertext = data.subarray(offset)

  const key = deriveKey(passphrase, salt)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Check if a file is encrypted.
 */
export async function isFileEncrypted(filePath: string): Promise<boolean> {
  const fd = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(MAGIC.length)
    await fd.read(buf, 0, MAGIC.length, 0)
    return buf.equals(MAGIC)
  } finally {
    await fd.close()
  }
}

/**
 * Verify encryption passphrase for a user.
 */
export async function verifyEncryptionKey(userId: string, passphrase: string): Promise<boolean> {
  const db = getDb()
  const user = await db
    .selectFrom('users')
    .select('encryption_key_hash')
    .where('id', '=', userId)
    .executeTakeFirst()

  if (!user?.encryption_key_hash) return false
  return verifyPassphrase(passphrase, user.encryption_key_hash)
}

/**
 * Way out of archive encryption (removed): puts back in clear every encrypted EML and attachment of an account,
 * in place, then marks the mail readable again. A wrong passphrase fails each file (GCM tag), nothing is written.
 */
export async function decryptArchives(
  accountId: string,
  passphrase: string,
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<{ imported: number; skipped: number; errors: number }> {
  const db = getDb()
  const mails = await db.selectFrom('archived_mails').select(['id', 'eml_path'])
    .where('account_id', '=', accountId).where('is_encrypted', '=', true).execute()
  const result = { imported: 0, skipped: 0, errors: 0 }

  for (const [i, mail] of mails.entries()) {
    try {
      const attachments = await db.selectFrom('archived_attachments').select('file_path') // NOSONAR: one mail after the other
        .where('archived_mail_id', '=', mail.id).execute()
      for (const path of [mail.eml_path, ...attachments.map((a) => a.file_path)]) {
        if (await isFileEncrypted(path)) await fs.writeFile(path, await decryptFile(path, passphrase)) // NOSONAR
      }
      await db.updateTable('archived_mails').set({ is_encrypted: false }).where('id', '=', mail.id).execute() // NOSONAR
      result.imported++
    } catch (err) {
      result.errors++
      logger.warn({ err, accountId, mailId: mail.id }, 'Archive not decrypted')
    }
    await onProgress?.(i + 1, mails.length) // NOSONAR
  }
  return result
}

/**
 * Get encryption status for an account.
 */
export async function getEncryptionStatus(accountId: string) {
  const db = getDb()

  const [totalResult, encryptedResult] = await Promise.all([
    db.selectFrom('archived_mails')
      .where('account_id', '=', accountId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
    db.selectFrom('archived_mails')
      .where('account_id', '=', accountId)
      .where('is_encrypted', '=', true)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
  ])

  return {
    total: totalResult.count,
    encrypted: encryptedResult.count,
    unencrypted: totalResult.count - encryptedResult.count,
    percentage: totalResult.count > 0
      ? Math.round((encryptedResult.count / totalResult.count) * 100)
      : 0,
  }
}
