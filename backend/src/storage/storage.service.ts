import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { config } from '../config'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('storage')

export interface StorageBackend {
  type: 'local' | 's3'
  writeFile(filePath: string, content: string | Buffer): Promise<void>
  readFile(filePath: string): Promise<Buffer>
  readFileUtf8(filePath: string): Promise<string>
  exists(filePath: string): Promise<boolean>
  deleteFile(filePath: string): Promise<void>
  deleteDir(dirPath: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  createReadStream(filePath: string): Readable | Promise<Readable>
  listFiles(dirPath: string): Promise<string[]>
}

// ─── Local filesystem backend ───────────────────────────────

class LocalStorage implements StorageBackend {
  type = 'local' as const

  async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath)
  }

  async readFileUtf8(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async exists(filePath: string): Promise<boolean> {
    return fsSync.existsSync(filePath)
  }

  async deleteFile(filePath: string): Promise<void> {
    try { await fs.unlink(filePath) } catch { /* ignore */ }
  }

  async deleteDir(dirPath: string): Promise<void> {
    try { await fs.rm(dirPath, { recursive: true, force: true }) } catch { /* ignore */ }
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  createReadStream(filePath: string): Readable {
    return fsSync.createReadStream(filePath)
  }

  async listFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { recursive: true, withFileTypes: true })
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.join(e.parentPath ?? dirPath, e.name))
    } catch {
      return []
    }
  }
}

// ─── S3-compatible backend ──────────────────────────────────

class S3Storage implements StorageBackend {
  type = 's3' as const
  private client: S3Client
  private bucket: string

  constructor(opts: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
  }) {
    this.bucket = opts.bucket
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    })
  }

  private toKey(filePath: string): string {
    // Strip ARCHIVE_PATH prefix and normalize
    const rel = filePath.startsWith(config.ARCHIVE_PATH)
      ? filePath.slice(config.ARCHIVE_PATH.length)
      : filePath
    return rel.replace(/^\/+/, '')
  }

  async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: this.toKey(filePath),
        Body: body,
      },
    })
    await upload.done()
  }

  async readFile(filePath: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(filePath),
    }))
    const chunks: Buffer[] = []
    for await (const chunk of res.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async readFileUtf8(filePath: string): Promise<string> {
    const buf = await this.readFile(filePath)
    return buf.toString('utf-8')
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.toKey(filePath),
      }))
      return true
    } catch {
      return false
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.toKey(filePath),
      }))
    } catch { /* ignore */ }
  }

  async deleteDir(dirPath: string): Promise<void> {
    const prefix = this.toKey(dirPath + '/')
    let continuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))
      for (const obj of res.Contents ?? []) {
        if (obj.Key) {
          await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: obj.Key,
          }))
        }
      }
      continuationToken = res.NextContinuationToken
    } while (continuationToken)
  }

  async mkdir(_dirPath: string): Promise<void> {
    // S3 doesn't need explicit directory creation
  }

  async createReadStream(filePath: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(filePath),
    }))
    return res.Body as Readable
  }

  async listFiles(dirPath: string): Promise<string[]> {
    const prefix = this.toKey(dirPath + '/')
    const files: string[] = []
    let continuationToken: string | undefined
    do {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))
      for (const obj of res.Contents ?? []) {
        if (obj.Key) {
          files.push(path.join(config.ARCHIVE_PATH, obj.Key))
        }
      }
      continuationToken = res.NextContinuationToken
    } while (continuationToken)
    return files
  }
}

// ─── Factory ────────────────────────────────────────────────

const _localStorage = new LocalStorage()

/**
 * Get the storage backend for a user.
 * Falls back to local FS if no S3 config is found.
 */
export async function getStorageForUser(userId: string): Promise<StorageBackend> {
  const db = getDb()
  const cfg = await db
    .selectFrom('storage_configs')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst()

  if (cfg?.type === 's3' && cfg.s3_endpoint && cfg.s3_access_key_id && cfg.s3_secret_access_key) {
    logger.debug({ userId, type: 's3', endpoint: cfg.s3_endpoint }, 'using user S3 storage')
    return new S3Storage({
      endpoint: cfg.s3_endpoint,
      region: cfg.s3_region ?? 'us-east-1',
      bucket: cfg.s3_bucket ?? 'nid-archives',
      accessKeyId: cfg.s3_access_key_id,
      secretAccessKey: cfg.s3_secret_access_key,
      forcePathStyle: cfg.s3_force_path_style,
    })
  }

  // Fallback global S3 config from env
  if (config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY) {
    return new S3Storage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    })
  }

  return _localStorage
}

/**
 * Get the default local storage backend (no DB lookup).
 */
export function getLocalStorage(): StorageBackend {
  return _localStorage
}

/**
 * Test S3 connection with provided credentials.
 */
export async function testS3Connection(opts: {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const s3 = new S3Storage(opts)
    await s3.writeFile('__connection_test__', 'ok')
    await s3.deleteFile('__connection_test__')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
