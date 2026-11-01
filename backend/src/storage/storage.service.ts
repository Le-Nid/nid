import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

export interface StorageBackend {
  type: 'local'
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

// ─── Factory ────────────────────────────────────────────────

const _localStorage = new LocalStorage()

export function getLocalStorage(): StorageBackend {
  return _localStorage
}
