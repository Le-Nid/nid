import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// ─── Mock DB ────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    insertInto: () => chain,
    values: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
    returning: () => chain,
    onConflict: () => chain,
    columns: () => chain,
    doUpdateSet: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({ getDb: () => ({
  selectFrom: () => chainable(),
  insertInto: () => chainable(),
  updateTable: () => chainable(),
  deleteFrom: () => chainable(),
}) }))

vi.mock('pino', () => ({ default: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

// ─── Import after mocks ────────────────────────────────────
import {
  hashPassphrase,
  verifyPassphrase,
  encryptFile,
  decryptFile,
  isFileEncrypted,
  setupEncryption,
  verifyEncryptionKey,
  encryptArchives,
  getEncryptionStatus,
} from '../privacy/encryption.service'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── hashPassphrase / verifyPassphrase ─────────────────────
describe('hashPassphrase', () => {
  it('produces salt:hash format', () => {
    const hash = hashPassphrase('mySecret123')
    expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/)
  })

  it('produces different hashes for same passphrase (random salt)', () => {
    const h1 = hashPassphrase('same')
    const h2 = hashPassphrase('same')
    expect(h1).not.toBe(h2)
  })
})

describe('verifyPassphrase', () => {
  it('returns true for correct passphrase', () => {
    const hash = hashPassphrase('correct-pass')
    expect(verifyPassphrase('correct-pass', hash)).toBe(true)
  })

  it('returns false for wrong passphrase', () => {
    const hash = hashPassphrase('correct-pass')
    expect(verifyPassphrase('wrong-pass', hash)).toBe(false)
  })

  it('returns false for malformed hash', () => {
    expect(verifyPassphrase('any', 'invalid')).toBe(false)
  })

  it('returns false for empty hash parts', () => {
    expect(verifyPassphrase('any', ':')).toBe(false)
  })
})

// ─── encryptFile / decryptFile ─────────────────────────────
describe('encryptFile and decryptFile', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'encrypt-test-'))
    tmpFile = path.join(tmpDir, 'test.eml')
  })

  it('encrypts and decrypts file correctly', async () => {
    const content = 'Hello this is a test email content'
    await fs.writeFile(tmpFile, content, 'utf-8')

    await encryptFile(tmpFile, 'my-passphrase')

    // File should now be encrypted
    const encrypted = await fs.readFile(tmpFile)
    expect(encrypted.subarray(0, 7).toString()).toBe('GMENC01')

    const decrypted = await decryptFile(tmpFile, 'my-passphrase')
    expect(decrypted.toString('utf-8')).toBe(content)
  })

  it('does not double-encrypt already encrypted files', async () => {
    await fs.writeFile(tmpFile, 'test content', 'utf-8')
    await encryptFile(tmpFile, 'pass')
    const firstEncrypt = await fs.readFile(tmpFile)
    await encryptFile(tmpFile, 'pass')
    const secondEncrypt = await fs.readFile(tmpFile)
    expect(firstEncrypt.equals(secondEncrypt)).toBe(true)
  })

  it('decryptFile returns plaintext as-is for non-encrypted file', async () => {
    await fs.writeFile(tmpFile, 'plain text', 'utf-8')
    const result = await decryptFile(tmpFile, 'any-pass')
    expect(result.toString('utf-8')).toBe('plain text')
  })

  it('throws on wrong passphrase for decryption', async () => {
    await fs.writeFile(tmpFile, 'secret', 'utf-8')
    await encryptFile(tmpFile, 'correct')
    await expect(decryptFile(tmpFile, 'wrong')).rejects.toThrow()
  })
})

// ─── isFileEncrypted ────────────────────────────────────────
describe('isFileEncrypted', () => {
  let tmpFile: string

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enc-check-'))
    tmpFile = path.join(tmpDir, 'test.eml')
  })

  it('returns true for encrypted file', async () => {
    await fs.writeFile(tmpFile, 'plaintext', 'utf-8')
    await encryptFile(tmpFile, 'pass')
    expect(await isFileEncrypted(tmpFile)).toBe(true)
  })

  it('returns false for plain file', async () => {
    await fs.writeFile(tmpFile, 'just a regular file', 'utf-8')
    expect(await isFileEncrypted(tmpFile)).toBe(false)
  })
})

// ─── setupEncryption ────────────────────────────────────────
describe('setupEncryption', () => {
  it('calls db update with hashed passphrase', async () => {
    mockExecute.mockResolvedValue([])
    await setupEncryption('user-1', 'my-pass')
    expect(mockExecute).toHaveBeenCalled()
  })
})

// ─── verifyEncryptionKey ────────────────────────────────────
describe('verifyEncryptionKey', () => {
  it('returns false when user has no encryption key', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    const result = await verifyEncryptionKey('user-1', 'pass')
    expect(result).toBe(false)
  })

  it('returns false when hash is null', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ encryption_key_hash: null })
    const result = await verifyEncryptionKey('user-1', 'pass')
    expect(result).toBe(false)
  })

  it('returns true when passphrase matches', async () => {
    const hash = hashPassphrase('correct')
    mockExecuteTakeFirst.mockResolvedValue({ encryption_key_hash: hash })
    const result = await verifyEncryptionKey('user-1', 'correct')
    expect(result).toBe(true)
  })

  it('returns false when passphrase does not match', async () => {
    const hash = hashPassphrase('correct')
    mockExecuteTakeFirst.mockResolvedValue({ encryption_key_hash: hash })
    const result = await verifyEncryptionKey('user-1', 'wrong')
    expect(result).toBe(false)
  })
})

// ─── encryptArchives ───────────────────────────────────────
describe('encryptArchives', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enc-archives-'))
  })

  it('encrypts unencrypted archive files', async () => {
    const emlPath = path.join(tmpDir, 'mail.eml')
    await fs.writeFile(emlPath, 'email content', 'utf-8')

    mockExecute.mockResolvedValueOnce([{ id: 'mail-1', eml_path: emlPath }]) // archived_mails query
      .mockResolvedValueOnce([]) // attachments query
      .mockResolvedValue([]) // update

    const result = await encryptArchives('acc-1', 'secret')
    expect(result.encrypted).toBe(1)
    expect(result.errors).toBe(0)
    expect(await isFileEncrypted(emlPath)).toBe(true)
  })

  it('counts errors for missing files', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'mail-1', eml_path: '/nonexistent/file.eml' }])

    const result = await encryptArchives('acc-1', 'secret')
    expect(result.errors).toBe(1)
    expect(result.encrypted).toBe(0)
  })

  it('calls onProgress callback', async () => {
    const emlPath = path.join(tmpDir, 'p.eml')
    await fs.writeFile(emlPath, 'content', 'utf-8')

    mockExecute.mockResolvedValueOnce([{ id: 'm1', eml_path: emlPath }])
      .mockResolvedValueOnce([]) // attachments
      .mockResolvedValue([])

    const onProgress = vi.fn()
    await encryptArchives('acc-1', 'pass', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })
})

// ─── getEncryptionStatus ────────────────────────────────────
describe('getEncryptionStatus', () => {
  it('returns correct stats', async () => {
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 100 }) // total
      .mockResolvedValueOnce({ count: 75 })  // encrypted

    const result = await getEncryptionStatus('acc-1')
    expect(result.total).toBe(100)
    expect(result.encrypted).toBe(75)
    expect(result.unencrypted).toBe(25)
    expect(result.percentage).toBe(75)
  })

  it('returns 0% for empty archive', async () => {
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })

    const result = await getEncryptionStatus('acc-1')
    expect(result.percentage).toBe(0)
  })
})
