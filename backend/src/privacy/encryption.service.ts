import crypto from 'crypto'
import fs from 'fs/promises'
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
 * Hash the passphrase for storage (to verify later without storing it).
 */
export function hashPassphrase(passphrase: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(passphrase, salt, 64).toString('hex')
  return `${salt}:${hash}`
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
 * Encrypt a file in-place.
 * Format: MAGIC(7) + SALT(32) + IV(12) + TAG(16) + CIPHERTEXT
 */
export async function encryptFile(filePath: string, passphrase: string): Promise<void> {
  const plaintext = await fs.readFile(filePath)

  // Skip if already encrypted
  if (plaintext.subarray(0, MAGIC.length).equals(MAGIC)) {
    return
  }

  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(passphrase, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const output = Buffer.concat([MAGIC, salt, iv, tag, encrypted])
  await fs.writeFile(filePath, output)
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
 * Set up encryption for a user (stores passphrase hash).
 */
export async function setupEncryption(userId: string, passphrase: string): Promise<void> {
  const db = getDb()
  const hash = hashPassphrase(passphrase)
  await db
    .updateTable('users')
    .set({ encryption_key_hash: hash })
    .where('id', '=', userId)
    .execute()
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
 * Encrypt all un-encrypted archives for an account.
 */
export async function encryptArchives(
  accountId: string,
  passphrase: string,
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<{ encrypted: number; errors: number }> {
  const { onProgress } = options
  const db = getDb()

  const mails = await db
    .selectFrom('archived_mails')
    .select(['id', 'eml_path'])
    .where('gmail_account_id', '=', accountId)
    .where('is_encrypted', '=', false)
    .execute()

  let encrypted = 0
  let errors = 0

  for (let i = 0; i < mails.length; i++) {
    try {
      await encryptFile(mails[i].eml_path, passphrase)

      // Also encrypt attachments
      const attachments = await db
        .selectFrom('archived_attachments')
        .select('file_path')
        .where('archived_mail_id', '=', mails[i].id)
        .execute()

      for (const att of attachments) {
        try {
          await encryptFile(att.file_path, passphrase)
        } catch (err) {
          logger.warn(`Failed to encrypt attachment ${att.file_path}: ${(err as Error).message}`)
        }
      }

      await db
        .updateTable('archived_mails')
        .set({ is_encrypted: true })
        .where('id', '=', mails[i].id)
        .execute()

      encrypted++
    } catch (err) {
      logger.warn(`Failed to encrypt ${mails[i].eml_path}: ${(err as Error).message}`)
      errors++
    }

    onProgress?.(i + 1, mails.length)
  }

  return { encrypted, errors }
}

/**
 * Get encryption status for an account.
 */
export async function getEncryptionStatus(accountId: string) {
  const db = getDb()

  const [totalResult, encryptedResult] = await Promise.all([
    db.selectFrom('archived_mails')
      .where('gmail_account_id', '=', accountId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
    db.selectFrom('archived_mails')
      .where('gmail_account_id', '=', accountId)
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
