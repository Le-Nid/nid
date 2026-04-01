import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'

// ─── Mock dependencies ─────────────────────────────────────
const mockExecute = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    execute: mockExecute,
  }
  return chain
}

let mockArchivePath = '/tmp/test-archives'

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
  }),
}))

vi.mock('../config', () => ({
  config: {
    get ARCHIVE_PATH() { return mockArchivePath },
  },
}))

import { checkArchiveIntegrity } from '../archive/integrity.service'

beforeEach(() => {
  vi.clearAllMocks()
  mockArchivePath = mkdtempSync(path.join(os.tmpdir(), 'integrity-test-'))
})

describe('checkArchiveIntegrity', () => {
  it('returns healthy for empty DB', async () => {
    mockExecute.mockResolvedValue([])

    const result = await checkArchiveIntegrity()
    expect(result.totalRecords).toBe(0)
    expect(result.healthy).toBe(true)
    expect(result.missingFiles).toEqual([])
    expect(result.orphanedFiles).toEqual([])
    expect(result.corruptedFiles).toEqual([])
  })

  it('detects missing files', async () => {
    mockExecute.mockResolvedValue([
      { id: 'm1', eml_path: '/nonexistent/path/mail.eml', gmail_account_id: 'acc1', size_bytes: 1000 },
    ])

    const result = await checkArchiveIntegrity()
    expect(result.missingFiles).toContain('/nonexistent/path/mail.eml')
    expect(result.healthy).toBe(false)
  })

  it('detects corrupted (empty) files', async () => {
    const emlPath = path.join(mockArchivePath, 'test.eml')
    writeFileSync(emlPath, '')

    mockExecute.mockResolvedValue([
      { id: 'm1', eml_path: emlPath, gmail_account_id: 'acc1', size_bytes: 1000 },
    ])

    const result = await checkArchiveIntegrity()
    // We pass the full path, so we need to check relative
    expect(result.corruptedFiles.length).toBe(1)
    expect(result.healthy).toBe(false)
  })

  it('detects normal healthy files', async () => {
    const emlPath = path.join(mockArchivePath, 'good.eml')
    writeFileSync(emlPath, 'Subject: Test\r\n\r\nBody')

    mockExecute.mockResolvedValue([
      { id: 'm1', eml_path: emlPath, gmail_account_id: 'acc1', size_bytes: 100 },
    ])

    const result = await checkArchiveIntegrity()
    expect(result.missingFiles).toEqual([])
    expect(result.corruptedFiles).toEqual([])
    expect(result.healthy).toBe(true)
  })

  it('detects orphaned files', async () => {
    const accDir = path.join(mockArchivePath, 'acc1')
    mkdirSync(accDir, { recursive: true })
    writeFileSync(path.join(accDir, 'orphan.eml'), 'content')

    // DB has a record for acc1 but different file
    const knownEml = path.join(accDir, 'known.eml')
    writeFileSync(knownEml, 'known content')

    mockExecute.mockResolvedValue([
      { id: 'm1', eml_path: knownEml, gmail_account_id: 'acc1', size_bytes: 100 },
    ])

    const result = await checkArchiveIntegrity('acc1')
    expect(result.orphanedFiles.length).toBeGreaterThanOrEqual(1)
  })

  it('handles accountId filter', async () => {
    const emlPath = path.join(mockArchivePath, 'filtered.eml')
    writeFileSync(emlPath, 'content')

    mockExecute.mockResolvedValue([
      { id: 'm1', eml_path: emlPath, gmail_account_id: 'acc1', size_bytes: 100 },
    ])

    const result = await checkArchiveIntegrity('acc1')
    expect(result.totalRecords).toBe(1)
  })
})
