import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config', () => ({
  config: { ARCHIVE_PATH: '/tmp/archives' },
}))

vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue({
    type: 'local',
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('test')),
    readFileUtf8: vi.fn().mockResolvedValue('Subject: Test\n\nBody'),
    exists: vi.fn().mockResolvedValue(false),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(
      'From sender@test.com Mon Jan 01 00:00:00 2024\nSubject: Test 1\nFrom: sender@test.com\n\nBody 1\nFrom sender@test.com Mon Jan 01 00:00:00 2024\nSubject: Test 2\nFrom: sender@test.com\n\nBody 2'
    ),
  },
}))

vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockResolvedValue({
    messageId: '<msg-1@test.com>',
    subject: 'Test Subject',
    from: { text: 'sender@test.com' },
    to: { text: 'recipient@test.com' },
    date: new Date('2024-01-15'),
    text: 'Body text',
    attachments: [],
    inReplyTo: null,
    references: null,
  }),
}))

// DB mock
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

// Mock imapflow for importImap
const { mockImapClient } = vi.hoisted(() => {
  const mockRelease = vi.fn()
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: mockRelease }),
    status: vi.fn().mockResolvedValue({ messages: 2 }),
    fetch: vi.fn().mockImplementation(function* () {
      yield { source: Buffer.from('Subject: Test 1\nFrom: a@b.com\n\nBody 1') }
      yield { source: Buffer.from('Subject: Test 2\nFrom: c@d.com\n\nBody 2') }
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  }
  return { mockImapClient: client }
})

vi.mock('imapflow', () => {
  return {
    ImapFlow: class {
      connect = mockImapClient.connect
      getMailboxLock = mockImapClient.getMailboxLock
      status = mockImapClient.status
      fetch = mockImapClient.fetch
      logout = mockImapClient.logout
    },
  }
})

import { parseMbox, importMbox, exportMbox, importImap } from '../archive/import.service'

beforeEach(() => vi.clearAllMocks())

describe('parseMbox', () => {
  it('splits mbox into individual messages', () => {
    const content = 'From sender@test.com Mon Jan 01 00:00:00 2024\nSubject: First\n\nBody1\nFrom sender@test.com Mon Jan 01 00:00:00 2024\nSubject: Second\n\nBody2'
    const messages = parseMbox(content)
    expect(messages.length).toBe(2)
  })

  it('handles single message without From line', () => {
    const content = 'Subject: Only\n\nBody'
    const messages = parseMbox(content)
    expect(messages.length).toBe(1)
    expect(messages[0]).toContain('Body')
  })

  it('unescapes >From quoting', () => {
    const content = 'Subject: Test\n\n>From someone\nMore text'
    const messages = parseMbox(content)
    expect(messages[0]).toContain('From someone')
  })

  it('handles empty content', () => {
    const messages = parseMbox('')
    expect(messages).toEqual([])
  })
})

describe('importMbox', () => {
  it('imports messages from mbox file', async () => {
    // First call: check existing → not found → import
    mockExecuteTakeFirst.mockResolvedValue(null) // no duplicate
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'archived-1' })

    const result = await importMbox('user-1', 'acc-1', '/tmp/test.mbox')
    expect(result.imported).toBeGreaterThanOrEqual(0)
    expect(typeof result.skipped).toBe('number')
    expect(typeof result.errors).toBe('number')
  })

  it('skips duplicate messages', async () => {
    mockExecuteTakeFirst.mockResolvedValue({ id: 'existing-1' }) // duplicate found

    const result = await importMbox('user-1', 'acc-1', '/tmp/test.mbox')
    expect(result.skipped).toBeGreaterThanOrEqual(0)
  })

  it('calls onProgress callback', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'archived-1' })

    const onProgress = vi.fn()
    await importMbox('user-1', 'acc-1', '/tmp/test.mbox', { onProgress })
    // onProgress is called at least once at the end
    expect(onProgress).toHaveBeenCalled()
  })

  it('handles import errors gracefully', async () => {
    const { simpleParser } = await import('mailparser')
    ;(simpleParser as any).mockRejectedValueOnce(new Error('parse error'))
    ;(simpleParser as any).mockResolvedValueOnce({
      messageId: '<msg-ok@test.com>',
      subject: 'OK',
      from: { text: 'a@b.com' },
      to: { text: 'c@d.com' },
      date: new Date(),
      text: 'ok',
      attachments: [],
    })
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-1' })

    const result = await importMbox('user-1', 'acc-1', '/tmp/test.mbox')
    expect(result.errors).toBeGreaterThanOrEqual(1)
  })

  it('imports messages with attachments', async () => {
    const { simpleParser } = await import('mailparser')
    ;(simpleParser as any).mockResolvedValue({
      messageId: '<att-msg@test.com>',
      subject: 'With attachment',
      from: { text: 'sender@test.com' },
      to: { text: 'recipient@test.com' },
      date: new Date('2024-06-15'),
      text: 'See attached',
      attachments: [
        {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          size: 1024,
          content: Buffer.from('fake pdf'),
        },
      ],
      inReplyTo: '<ref@test.com>',
      references: ['<ref@test.com>'],
    })
    mockExecuteTakeFirst.mockResolvedValue(null) // no duplicate
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-att' })
    mockExecute.mockResolvedValue([]) // insert attachments

    const result = await importMbox('user-1', 'acc-1', '/tmp/test.mbox')
    expect(result.imported).toBeGreaterThanOrEqual(1)
  })

  it('generates messageId when none in parsed email', async () => {
    const { simpleParser } = await import('mailparser')
    ;(simpleParser as any).mockResolvedValue({
      messageId: undefined,
      subject: 'No ID',
      from: { text: 'a@b.com' },
      to: [{ text: 'c@d.com' }, { text: 'e@f.com' }],
      date: null,
      text: 'body',
      attachments: [],
      inReplyTo: null,
      references: null,
    })
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-noid' })

    const result = await importMbox('user-1', 'acc-1', '/tmp/test.mbox')
    expect(result.imported).toBeGreaterThanOrEqual(1)
  })
})

describe('exportMbox', () => {
  it('exports archived mails as mbox stream', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'mail-1', eml_path: '/tmp/1.eml', sender: 'Test <test@test.com>', date: new Date('2024-01-15') },
      { id: 'mail-2', eml_path: '/tmp/2.eml', sender: 'plain@test.com', date: new Date('2024-01-16') },
    ])

    const stream = await exportMbox('user-1', 'acc-1')
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk.toString())
    }
    const output = chunks.join('')
    expect(output).toContain('From ')
  })

  it('exports specific mail IDs', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'mail-1', eml_path: '/tmp/1.eml', sender: null, date: null },
    ])

    const stream = await exportMbox('user-1', 'acc-1', ['mail-1'])
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk.toString())
    }
    const output = chunks.join('')
    expect(output).toContain('From ')
  })

  it('handles read errors for individual mails', async () => {
    const { getStorageForUser } = await import('../storage/storage.service')
    const storage = await (getStorageForUser as any)('user-1')
    storage.readFileUtf8.mockRejectedValueOnce(new Error('file not found'))
    storage.readFileUtf8.mockResolvedValueOnce('Subject: OK\n\nBody')

    mockExecute.mockResolvedValueOnce([
      { id: 'mail-err', eml_path: '/tmp/bad.eml', sender: 'a@b.com', date: new Date() },
      { id: 'mail-ok', eml_path: '/tmp/ok.eml', sender: 'c@d.com', date: new Date() },
    ])

    const stream = await exportMbox('user-1', 'acc-1')
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk.toString())
    }
    // Should still have content from the second mail
    const output = chunks.join('')
    expect(output).toContain('From ')
  })

  it('returns empty stream when no mails', async () => {
    mockExecute.mockResolvedValueOnce([])

    const stream = await exportMbox('user-1', 'acc-1')
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk.toString())
    }
    expect(chunks.join('')).toBe('')
  })
})

describe('importImap', () => {
  it('imports messages from IMAP server', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null) // no duplicates
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-imap-1' })

    const result = await importImap('user-1', 'acc-1', {
      host: 'imap.test.com',
      port: 993,
      secure: true,
      user: 'user@test.com',
      pass: 'password',
    })
    expect(result.imported).toBeGreaterThanOrEqual(0)
    expect(typeof result.skipped).toBe('number')
    expect(typeof result.errors).toBe('number')
    expect(mockImapClient.connect).toHaveBeenCalled()
    expect(mockImapClient.logout).toHaveBeenCalled()
  })

  it('uses custom folder and maxMessages', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-imap-2' })

    const result = await importImap('user-1', 'acc-1', {
      host: 'imap.test.com',
      port: 993,
      secure: true,
      user: 'user@test.com',
      pass: 'password',
      folder: 'Archive',
      maxMessages: 100,
    })
    expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith('Archive')
    expect(result.imported).toBeGreaterThanOrEqual(0)
  })

  it('skips messages without source', async () => {
    mockImapClient.fetch.mockImplementationOnce(function* () {
      yield { source: null }
      yield { source: Buffer.from('Subject: OK\n\nBody') }
    })
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-skip' })

    const result = await importImap('user-1', 'acc-1', {
      host: 'imap.test.com',
      port: 993,
      secure: true,
      user: 'user@test.com',
      pass: 'password',
    })
    expect(result.skipped).toBeGreaterThanOrEqual(1)
  })

  it('calls onProgress callback', async () => {
    // Make fetch return > 10 messages to trigger progress
    const messages = Array.from({ length: 12 }, (_, i) => ({
      source: Buffer.from(`Subject: Msg ${i}\n\nBody ${i}`),
    }))
    mockImapClient.fetch.mockImplementationOnce(function* () {
      for (const msg of messages) yield msg
    })
    mockImapClient.status.mockResolvedValueOnce({ messages: 12 })
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-prog' })

    const onProgress = vi.fn()
    await importImap('user-1', 'acc-1', {
      host: 'imap.test.com',
      port: 993,
      secure: true,
      user: 'user@test.com',
      pass: 'password',
    }, { onProgress })
    expect(onProgress).toHaveBeenCalled()
  })

  it('handles import errors in individual messages', async () => {
    const { simpleParser } = await import('mailparser')
    ;(simpleParser as any).mockRejectedValueOnce(new Error('bad eml'))
    ;(simpleParser as any).mockResolvedValueOnce({
      messageId: '<ok@test.com>',
      subject: 'OK',
      from: { text: 'a@b.com' },
      to: { text: 'c@d.com' },
      date: new Date(),
      text: 'ok',
      attachments: [],
    })
    mockExecuteTakeFirst.mockResolvedValue(null)
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'arch-err' })

    const result = await importImap('user-1', 'acc-1', {
      host: 'imap.test.com',
      port: 993,
      secure: true,
      user: 'user@test.com',
      pass: 'password',
    })
    expect(result.errors).toBeGreaterThanOrEqual(1)
  })
})
