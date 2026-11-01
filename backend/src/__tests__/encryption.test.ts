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
import { verifyPassphrase, decryptFile, isFileEncrypted, verifyEncryptionKey, decryptArchives, getEncryptionStatus } from '../privacy/encryption.service'

// Fixtures in the format archives were encrypted with (the encrypting code is gone): MAGIC + SALT + IV + TAG + data
const MAGIC = Buffer.from('GMENC01')
function encrypted(plain: string, passphrase: string): Buffer {
  const salt = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha512')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data])
}
function storedHash(passphrase: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(passphrase, salt, 64).toString('hex')}`
}

let tmpDir: string
beforeEach(async () => {
  vi.clearAllMocks()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enc-'))
})

describe('verifyPassphrase', () => {
  it('matches the stored scrypt hash, refuses a wrong or malformed one', () => {
    const hash = storedHash('correct')
    expect(verifyPassphrase('correct', hash)).toBe(true)
    expect(verifyPassphrase('wrong', hash)).toBe(false)
    expect(verifyPassphrase('x', 'nohash')).toBe(false)
    expect(verifyPassphrase('x', ':')).toBe(false)
  })
})

describe('decryptFile / isFileEncrypted', () => {
  it('decrypts an encrypted file, returns a plain one as is, fails on a wrong passphrase', async () => {
    const enc = path.join(tmpDir, 'a.eml')
    const plain = path.join(tmpDir, 'b.eml')
    await fs.writeFile(enc, encrypted('Subject: hi', 'secret'))
    await fs.writeFile(plain, 'Subject: plain')
    expect(await isFileEncrypted(enc)).toBe(true)
    expect(await isFileEncrypted(plain)).toBe(false)
    expect((await decryptFile(enc, 'secret')).toString()).toBe('Subject: hi')
    expect((await decryptFile(plain, 'secret')).toString()).toBe('Subject: plain')
    await expect(decryptFile(enc, 'wrong')).rejects.toThrow()
  })
})

describe('verifyEncryptionKey', () => {
  it('false without a key, true only for the right passphrase', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    expect(await verifyEncryptionKey('u1', 'pass')).toBe(false)
    mockExecuteTakeFirst.mockResolvedValueOnce({ encryption_key_hash: null })
    expect(await verifyEncryptionKey('u1', 'pass')).toBe(false)
    const hash = storedHash('correct')
    mockExecuteTakeFirst.mockResolvedValueOnce({ encryption_key_hash: hash })
    expect(await verifyEncryptionKey('u1', 'correct')).toBe(true)
    mockExecuteTakeFirst.mockResolvedValueOnce({ encryption_key_hash: hash })
    expect(await verifyEncryptionKey('u1', 'wrong')).toBe(false)
  })
})

describe('decryptArchives', () => {
  it('puts the EML and its encrypted attachments back in clear, skips plain files, counts errors', async () => {
    const eml = path.join(tmpDir, 'm.eml')
    const att = path.join(tmpDir, 'a.pdf')
    const plainAtt = path.join(tmpDir, 'b.txt')
    await fs.writeFile(eml, encrypted('Subject: one', 'secret'))
    await fs.writeFile(att, encrypted('%PDF', 'secret'))
    await fs.writeFile(plainAtt, 'already clear')
    mockExecute
      .mockResolvedValueOnce([{ id: 'm1', eml_path: eml }, { id: 'm2', eml_path: '/missing.eml' }]) // encrypted mails
      .mockResolvedValueOnce([{ file_path: att }, { file_path: plainAtt }]) // m1 attachments
      .mockResolvedValueOnce([]) // m1 marked clear
      .mockResolvedValueOnce([]) // m2 attachments
    const onProgress = vi.fn()

    expect(await decryptArchives('acc-1', 'secret', onProgress)).toEqual({ imported: 1, skipped: 0, errors: 1 })
    expect(await fs.readFile(eml, 'utf8')).toBe('Subject: one')
    expect(await fs.readFile(att, 'utf8')).toBe('%PDF')
    expect(await fs.readFile(plainAtt, 'utf8')).toBe('already clear')
    expect(onProgress).toHaveBeenLastCalledWith(2, 2)
  })

  it('a wrong passphrase writes nothing', async () => {
    const eml = path.join(tmpDir, 'm.eml')
    const before = encrypted('Subject: one', 'secret')
    await fs.writeFile(eml, before)
    mockExecute.mockResolvedValueOnce([{ id: 'm1', eml_path: eml }]).mockResolvedValueOnce([])
    expect(await decryptArchives('acc-1', 'wrong')).toEqual({ imported: 0, skipped: 0, errors: 1 })
    expect((await fs.readFile(eml)).equals(before)).toBe(true)
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
