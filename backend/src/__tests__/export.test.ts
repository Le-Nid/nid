import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

// ─── Mock dependencies ─────────────────────────────────────
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
    leftJoin: () => chain,
    insertInto: () => chain,
    values: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
  }),
}))

vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    pipe: vi.fn(),
    file: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { streamArchiveZip } from '../archive/export.service'

beforeEach(() => vi.clearAllMocks())

describe('streamArchiveZip', () => {
  it('returns zero counts for empty mail list', async () => {
    mockExecute.mockResolvedValue([])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', [], output)
    expect(result.mailCount).toBe(0)
    expect(result.attachmentCount).toBe(0)
  })

  it('processes mails and counts attachments', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    mockExecute.mockResolvedValue([
      {
        id: 'mail-1',
        gmail_message_id: 'gm1',
        subject: 'Test Subject',
        date: new Date('2025-01-15'),
        eml_path: '/archives/acc1/2025/01/gm1.eml',
        att_id: 'att-1',
        att_filename: 'doc.pdf',
        att_file_path: '/archives/acc1/2025/01/gm1_attachments/doc.pdf',
      },
    ])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', ['mail-1'], output)
    expect(result.mailCount).toBe(1)
    expect(result.attachmentCount).toBe(1)
  })

  it('handles mail without attachments', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    mockExecute.mockResolvedValue([
      {
        id: 'mail-1',
        gmail_message_id: 'gm1',
        subject: 'No Attachments',
        date: new Date(),
        eml_path: '/archives/acc1/2025/01/gm1.eml',
        att_id: null,
        att_filename: null,
        att_file_path: null,
      },
    ])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', ['mail-1'], output)
    expect(result.mailCount).toBe(1)
    expect(result.attachmentCount).toBe(0)
  })

  it('skips non-existent files', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    mockExecute.mockResolvedValue([
      {
        id: 'mail-1',
        gmail_message_id: 'gm1',
        subject: 'Test',
        date: new Date(),
        eml_path: '/nonexistent/path.eml',
        att_id: null,
        att_filename: null,
        att_file_path: null,
      },
    ])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', ['mail-1'], output)
    expect(result.mailCount).toBe(1)
    expect(result.attachmentCount).toBe(0)
  })

  it('handles null subject', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    mockExecute.mockResolvedValue([
      {
        id: 'mail-1',
        gmail_message_id: 'gm1',
        subject: null,
        date: new Date(),
        eml_path: '/test.eml',
        att_id: null,
        att_filename: null,
        att_file_path: null,
      },
    ])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', ['mail-1'], output)
    expect(result.mailCount).toBe(1)
  })

  it('handles null date', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    mockExecute.mockResolvedValue([
      {
        id: 'mail-1',
        gmail_message_id: 'gm1',
        subject: 'Test',
        date: null,
        eml_path: '/test.eml',
        att_id: null,
        att_filename: null,
        att_file_path: null,
      },
    ])

    const output = { write: vi.fn(), end: vi.fn() } as any
    const result = await streamArchiveZip('acc-1', ['mail-1'], output)
    expect(result.mailCount).toBe(1)
  })
})
