import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'

// ─── DB mock ──────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockExecuteTakeFirstOrThrow
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

vi.mock('../config', () => ({
  config: {
    ARCHIVE_PATH: '/tmp/archives',
    S3_ENDPOINT: '',
    S3_ACCESS_KEY_ID: '',
    S3_SECRET_ACCESS_KEY: '',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'nid-archives',
    S3_FORCE_PATH_STYLE: true,
  },
}))

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockImplementation((_path: string, encoding?: string) => {
      if (encoding === 'utf-8') return Promise.resolve('test content')
      return Promise.resolve(Buffer.from('test content'))
    }),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue(new Readable({ read() { this.push(null) } })),
  },
}))

// ─── AWS SDK mocks ──────────────────────────────────────────
const { mockS3Send, mockUploadDone } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
  mockUploadDone: vi.fn().mockResolvedValue({}),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    constructor(_opts: any) {}
    send = mockS3Send
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
  }
})

vi.mock('@aws-sdk/lib-storage', () => {
  class MockUpload {
    constructor(_opts: any) {}
    done = mockUploadDone
  }
  return { Upload: MockUpload }
})

import { getStorageForUser, getLocalStorage, testS3Connection } from '../storage/storage.service'

beforeEach(() => vi.clearAllMocks())

describe('getLocalStorage', () => {
  it('returns a local storage backend', () => {
    const storage = getLocalStorage()
    expect(storage.type).toBe('local')
  })
})

describe('getStorageForUser', () => {
  it('returns local storage when no S3 config in DB or env', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null) // no storage_configs row
    const storage = await getStorageForUser('user-1')
    expect(storage.type).toBe('local')
  })

  it('returns local storage when DB has local type', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ type: 'local' })
    const storage = await getStorageForUser('user-1')
    expect(storage.type).toBe('local')
  })

  it('returns S3 storage when DB has complete S3 config', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      type: 's3',
      s3_endpoint: 'http://minio:9000',
      s3_region: 'us-east-1',
      s3_bucket: 'test-bucket',
      s3_access_key_id: 'access-key',
      s3_secret_access_key: 'secret-key',
      s3_force_path_style: true,
    })
    const storage = await getStorageForUser('user-1')
    expect(storage.type).toBe('s3')
  })

  it('returns local when S3 config is incomplete', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      type: 's3',
      s3_endpoint: null,
      s3_access_key_id: null,
      s3_secret_access_key: null,
    })
    const storage = await getStorageForUser('user-1')
    expect(storage.type).toBe('local')
  })
})

describe('LocalStorage operations', () => {
  it('writeFile creates directory and writes', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    await storage.writeFile('/tmp/test/file.txt', 'content')
    expect(fsp.mkdir).toHaveBeenCalled()
    expect(fsp.writeFile).toHaveBeenCalledWith('/tmp/test/file.txt', 'content')
  })

  it('readFile reads buffer', async () => {
    const storage = getLocalStorage()
    const result = await storage.readFile('/tmp/test.txt')
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('readFileUtf8 reads string', async () => {
    const storage = getLocalStorage()
    const result = await storage.readFileUtf8('/tmp/test.txt')
    expect(typeof result).toBe('string')
  })

  it('exists returns boolean', async () => {
    const storage = getLocalStorage()
    const result = await storage.exists('/tmp/test.txt')
    expect(result).toBe(true)
  })

  it('deleteFile calls unlink', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    await storage.deleteFile('/tmp/test.txt')
    expect(fsp.unlink).toHaveBeenCalledWith('/tmp/test.txt')
  })

  it('deleteDir calls rm recursive', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    await storage.deleteDir('/tmp/testdir')
    expect(fsp.rm).toHaveBeenCalledWith('/tmp/testdir', { recursive: true, force: true })
  })

  it('mkdir creates directory recursively', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    await storage.mkdir('/tmp/testdir')
    expect(fsp.mkdir).toHaveBeenCalledWith('/tmp/testdir', { recursive: true })
  })

  it('createReadStream returns a readable', () => {
    const storage = getLocalStorage()
    const stream = storage.createReadStream('/tmp/test.txt')
    expect(stream).toBeDefined()
  })

  it('listFiles returns empty array on error', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    ;(fsp.readdir as any).mockRejectedValueOnce(new Error('ENOENT'))
    const result = await storage.listFiles('/nonexistent')
    expect(result).toEqual([])
  })

  it('listFiles returns file paths with parentPath', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    ;(fsp.readdir as any).mockResolvedValueOnce([
      { isFile: () => true, name: 'file1.txt', parentPath: '/tmp/dir' },
      { isFile: () => false, name: 'subdir', parentPath: '/tmp/dir' },
      { isFile: () => true, name: 'file2.txt', parentPath: '/tmp/dir/sub' },
    ])
    const result = await storage.listFiles('/tmp/dir')
    expect(result).toHaveLength(2)
  })

  it('deleteFile ignores errors', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    ;(fsp.unlink as any).mockRejectedValueOnce(new Error('ENOENT'))
    // Should not throw
    await expect(storage.deleteFile('/nonexistent')).resolves.not.toThrow()
  })

  it('deleteDir ignores errors', async () => {
    const storage = getLocalStorage()
    const fsp = (await import('fs/promises')).default
    ;(fsp.rm as any).mockRejectedValueOnce(new Error('ENOENT'))
    // Should not throw
    await expect(storage.deleteDir('/nonexistent')).resolves.not.toThrow()
  })
})

describe('getStorageForUser — env fallback S3', () => {
  it('uses global S3 config from env when DB has no S3 config', async () => {
    const { config } = await import('../config')
    const origEndpoint = config.S3_ENDPOINT
    const origKey = config.S3_ACCESS_KEY_ID
    const origSecret = config.S3_SECRET_ACCESS_KEY

    // Temporarily set env S3 config
    ;(config as any).S3_ENDPOINT = 'http://s3.example.com'
    ;(config as any).S3_ACCESS_KEY_ID = 'env-key'
    ;(config as any).S3_SECRET_ACCESS_KEY = 'env-secret'

    mockExecuteTakeFirst.mockResolvedValueOnce(null) // no DB config
    const storage = await getStorageForUser('user-1')
    expect(storage.type).toBe('s3')

    // Restore
    ;(config as any).S3_ENDPOINT = origEndpoint
    ;(config as any).S3_ACCESS_KEY_ID = origKey
    ;(config as any).S3_SECRET_ACCESS_KEY = origSecret
  })
})

describe('S3Storage operations', () => {
  async function getS3Storage() {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      type: 's3',
      s3_endpoint: 'http://minio:9000',
      s3_region: 'us-east-1',
      s3_bucket: 'test-bucket',
      s3_access_key_id: 'access-key',
      s3_secret_access_key: 'secret-key',
      s3_force_path_style: true,
    })
    return getStorageForUser('user-s3')
  }

  it('writeFile uploads via Upload', async () => {
    const storage = await getS3Storage()
    await storage.writeFile('/tmp/archives/test/file.txt', 'content')
    expect(mockUploadDone).toHaveBeenCalled()
  })

  it('writeFile handles Buffer content', async () => {
    const storage = await getS3Storage()
    await storage.writeFile('/tmp/archives/test/file.bin', Buffer.from('binary'))
    expect(mockUploadDone).toHaveBeenCalled()
  })

  it('readFile returns buffer from S3', async () => {
    const chunks = [Buffer.from('hello'), Buffer.from(' world')]
    mockS3Send.mockResolvedValueOnce({
      Body: (async function* () { for (const c of chunks) yield c })(),
    })
    const storage = await getS3Storage()
    const result = await storage.readFile('/tmp/archives/test/file.txt')
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.toString()).toBe('hello world')
  })

  it('readFileUtf8 returns string from S3', async () => {
    const chunks = [Buffer.from('utf8 content')]
    mockS3Send.mockResolvedValueOnce({
      Body: (async function* () { for (const c of chunks) yield c })(),
    })
    const storage = await getS3Storage()
    const result = await storage.readFileUtf8('/tmp/archives/test/file.txt')
    expect(typeof result).toBe('string')
    expect(result).toBe('utf8 content')
  })

  it('exists returns true when HeadObject succeeds', async () => {
    mockS3Send.mockResolvedValueOnce({})
    const storage = await getS3Storage()
    const result = await storage.exists('/tmp/archives/test/file.txt')
    expect(result).toBe(true)
  })

  it('exists returns false when HeadObject throws', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('NotFound'))
    const storage = await getS3Storage()
    const result = await storage.exists('/tmp/archives/test/file.txt')
    expect(result).toBe(false)
  })

  it('deleteFile sends DeleteObjectCommand', async () => {
    mockS3Send.mockResolvedValueOnce({})
    const storage = await getS3Storage()
    await storage.deleteFile('/tmp/archives/test/file.txt')
    expect(mockS3Send).toHaveBeenCalled()
  })

  it('deleteFile ignores errors', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('err'))
    const storage = await getS3Storage()
    await expect(storage.deleteFile('/tmp/archives/test/file.txt')).resolves.not.toThrow()
  })

  it('deleteDir deletes all objects with prefix', async () => {
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'test/dir/file1.txt' }, { Key: 'test/dir/file2.txt' }],
        NextContinuationToken: undefined,
      })
      .mockResolvedValueOnce({}) // DeleteObject file1
      .mockResolvedValueOnce({}) // DeleteObject file2
    const storage = await getS3Storage()
    await storage.deleteDir('/tmp/archives/test/dir')
    expect(mockS3Send).toHaveBeenCalledTimes(3) // List + 2 deletes
  })

  it('deleteDir handles pagination', async () => {
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'test/dir/file1.txt' }],
        NextContinuationToken: 'token-1',
      })
      .mockResolvedValueOnce({}) // DeleteObject
      .mockResolvedValueOnce({
        Contents: [{ Key: 'test/dir/file2.txt' }],
        NextContinuationToken: undefined,
      })
      .mockResolvedValueOnce({}) // DeleteObject
    const storage = await getS3Storage()
    await storage.deleteDir('/tmp/archives/test/dir')
    expect(mockS3Send).toHaveBeenCalledTimes(4)
  })

  it('deleteDir handles empty Contents', async () => {
    mockS3Send.mockResolvedValueOnce({
      Contents: undefined,
      NextContinuationToken: undefined,
    })
    const storage = await getS3Storage()
    await storage.deleteDir('/tmp/archives/test/dir')
    expect(mockS3Send).toHaveBeenCalledTimes(1)
  })

  it('mkdir is a no-op for S3', async () => {
    const storage = await getS3Storage()
    await storage.mkdir('/tmp/archives/test/dir')
    // Should not call S3
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('createReadStream returns readable from S3', async () => {
    const mockBody = new Readable({ read() { this.push(null) } })
    mockS3Send.mockResolvedValueOnce({ Body: mockBody })
    const storage = await getS3Storage()
    const stream = await storage.createReadStream('/tmp/archives/test/file.txt')
    expect(stream).toBeDefined()
  })

  it('listFiles returns file paths with ARCHIVE_PATH prefix', async () => {
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'acc-1/2024/01/mail.eml' }, { Key: 'acc-1/2024/01/att.pdf' }],
        NextContinuationToken: undefined,
      })
    const storage = await getS3Storage()
    const files = await storage.listFiles('/tmp/archives/acc-1/2024/01')
    expect(files).toHaveLength(2)
    expect(files[0]).toContain('/tmp/archives/')
  })

  it('listFiles handles pagination and null keys', async () => {
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'dir/file1.txt' }, { Key: undefined }],
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'dir/file2.txt' }],
        NextContinuationToken: undefined,
      })
    const storage = await getS3Storage()
    const files = await storage.listFiles('/tmp/archives/dir')
    expect(files).toHaveLength(2) // skips undefined key
  })

  it('toKey strips ARCHIVE_PATH prefix', async () => {
    mockS3Send.mockResolvedValueOnce({})
    const storage = await getS3Storage()
    // Call exists with a path that starts with ARCHIVE_PATH
    await storage.exists('/tmp/archives/acc-1/file.eml')
    expect(mockS3Send).toHaveBeenCalled()
  })

  it('toKey handles paths without ARCHIVE_PATH prefix', async () => {
    mockS3Send.mockResolvedValueOnce({})
    const storage = await getS3Storage()
    await storage.exists('relative/path/file.eml')
    expect(mockS3Send).toHaveBeenCalled()
  })
})

describe('testS3Connection', () => {
  it('returns success when write/delete works', async () => {
    const result = await testS3Connection({
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      bucket: 'test',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    })
    expect(result.success).toBe(true)
  })

  it('returns error when connection fails', async () => {
    mockUploadDone.mockRejectedValueOnce(new Error('Connection refused'))
    const result = await testS3Connection({
      endpoint: 'http://bad:9000',
      region: 'us-east-1',
      bucket: 'test',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})
