import crypto from 'node:crypto'
import { config } from '../config'

// AES-256-GCM, key derived from JWT_SECRET: rotating JWT_SECRET makes the sealed IMAP passwords unreadable (re-enter them)
const key = () => Buffer.from(crypto.hkdfSync('sha256', config.JWT_SECRET, '', 'nid:imap-credentials', 32))

/** `v1:iv:tag:data` (base64url), safe to store. */
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':')
}

/** Throws when the value was tampered with or sealed under another key. */
export function openSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(':')
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unknown sealed secret format')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
