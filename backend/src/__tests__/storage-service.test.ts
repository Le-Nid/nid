import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'

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

import { getLocalStorage } from '../storage/storage.service'

beforeEach(() => vi.clearAllMocks())

describe('getLocalStorage', () => {
  it('returns a local storage backend', () => {
    const storage = getLocalStorage()
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
