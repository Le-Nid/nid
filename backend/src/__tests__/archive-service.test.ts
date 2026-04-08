import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
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

const mockGmailGet = vi.fn()

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      messages: {
        get: (...args: any[]) => mockGmailGet(...args),
      },
    },
  }),
}))

vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: () => any) => fn(),
}))

const mockTrackApiCall = vi.fn().mockResolvedValue(undefined)
vi.mock('../gmail/quota.service', () => ({
  trackApiCall: (...args: any[]) => mockTrackApiCall(...args),
}))

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 100 }),
    readdir: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockResolvedValue({ attachments: [] }),
}))

import { archiveMail, getArchivedIds } from '../archive/archive.service'

beforeEach(() => vi.clearAllMocks())

describe('archiveMail', () => {
  it('skips archiving when already archived', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'existing-id' })

    await archiveMail('acc-1', 'msg-1')

    expect(mockGmailGet).not.toHaveBeenCalled()
    expect(mockTrackApiCall).not.toHaveBeenCalled()
  })

  it('archives mail and tracks API call', async () => {
    // No existing archive
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    // Build raw EML content
    const rawEml = [
      'Subject: Test Email',
      'From: sender@test.com',
      'To: me@test.com',
      'Date: Wed, 15 Jan 2025 10:00:00 +0000',
      '',
      'Hello World',
    ].join('\r\n')

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-1',
        threadId: 'thread-1',
        sizeEstimate: 1024,
        snippet: 'Hello World',
        labelIds: ['INBOX'],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    // DB insert returning id
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-1' })

    await archiveMail('acc-1', 'msg-1')

    expect(mockGmailGet).toHaveBeenCalled()
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('throws when raw EML is empty', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    mockGmailGet.mockResolvedValue({
      data: { id: 'msg-1', raw: null },
    })

    await expect(archiveMail('acc-1', 'msg-1')).rejects.toThrow('Empty raw for message msg-1')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('does not fail when trackApiCall rejects', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)
    mockTrackApiCall.mockRejectedValue(new Error('DB down'))

    const rawEml = 'Subject: Test\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody'
    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-1',
        threadId: 't-1',
        sizeEstimate: 100,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'a-1' })

    // Should not throw despite trackApiCall failing
    await archiveMail('acc-1', 'msg-1')
  })
})

describe('archiveMail with attachments', () => {
  it('archives mail with attachments and deduplicates existing ones', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    // No existing archive
    mockExecuteTakeFirst
      .mockResolvedValueOnce(undefined)      // check existing archive
      .mockResolvedValueOnce({ file_path: '/existing/file.pdf' })  // dedup check for 1st attachment

    const rawEml = [
      'Subject: With Attachment',
      'From: sender@test.com',
      'To: me@test.com',
      'Date: Wed, 15 Jan 2025 10:00:00 +0000',
      '',
      'Body with attachment',
    ].join('\r\n')

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-att',
        threadId: 'thread-att',
        sizeEstimate: 5000,
        snippet: 'Body',
        labelIds: ['INBOX'],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    // simpleParser returns mock attachments
    mockSimpleParser.mockResolvedValueOnce({
      attachments: [
        {
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 1024,
          content: Buffer.from('fake-pdf-content'),
        },
      ],
    } as any)

    // DB insert returning id for archived_mails
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-att' })
    // DB insert for attachments
    mockExecute.mockResolvedValueOnce([])

    await archiveMail('acc-1', 'msg-att')

    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('creates new file when no dedup match exists', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    mockExecuteTakeFirst
      .mockResolvedValueOnce(undefined)  // no existing archive
      .mockResolvedValueOnce(undefined)  // no dedup match

    const rawEml = 'Subject: New\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody'

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-new',
        threadId: 't-new',
        sizeEstimate: 2000,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    mockSimpleParser.mockResolvedValueOnce({
      attachments: [
        {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          size: 2048,
          content: Buffer.from('fake-image'),
        },
      ],
    } as any)

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-new' })
    mockExecute.mockResolvedValueOnce([])

    await archiveMail('acc-1', 'msg-new')

    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('skips attachments without filename', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    const rawEml = 'Subject: No Att\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody'
    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-noatt',
        threadId: 't-noatt',
        sizeEstimate: 500,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    mockSimpleParser.mockResolvedValueOnce({
      attachments: [
        { filename: null, contentType: 'text/plain', size: 10, content: Buffer.from('x') },
      ],
    } as any)

    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-noatt' })

    await archiveMail('acc-1', 'msg-noatt')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })
})

describe('archiveMail with encoded headers', () => {
  it('handles RFC 2047 base64 encoded Subject', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    // =?UTF-8?B?...?= encodes "Testé"
    const encodedSubject = '=?UTF-8?B?VGVzdMOp?='
    const rawEml = `Subject: ${encodedSubject}\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody`

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-enc',
        threadId: 't-enc',
        sizeEstimate: 300,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    mockSimpleParser.mockResolvedValueOnce({ attachments: [] } as any)
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-enc' })

    await archiveMail('acc-1', 'msg-enc')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('handles RFC 2047 quoted-printable encoded Subject', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    const encodedSubject = '=?UTF-8?Q?Test=C3=A9?='
    const rawEml = `Subject: ${encodedSubject}\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody`

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-qp',
        threadId: 't-qp',
        sizeEstimate: 300,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    mockSimpleParser.mockResolvedValueOnce({ attachments: [] } as any)
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-qp' })

    await archiveMail('acc-1', 'msg-qp')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('handles header continuation lines', async () => {
    const { simpleParser } = await import('mailparser')
    const mockSimpleParser = vi.mocked(simpleParser)

    mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

    // Header with continuation line (indented with space)
    const rawEml = 'Subject: Very Long\r\n Subject Line\r\nFrom: a@b.com\r\nDate: Wed, 15 Jan 2025 10:00:00 +0000\r\n\r\nBody'

    mockGmailGet.mockResolvedValue({
      data: {
        id: 'msg-cont',
        threadId: 't-cont',
        sizeEstimate: 300,
        snippet: 'Body',
        labelIds: [],
        raw: Buffer.from(rawEml).toString('base64url'),
      },
    })

    mockSimpleParser.mockResolvedValueOnce({ attachments: [] } as any)
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'archived-cont' })

    await archiveMail('acc-1', 'msg-cont')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })
})

describe('getArchivedIds', () => {
  it('returns set of archived message IDs', async () => {
    mockExecute.mockResolvedValueOnce([
      { gmail_message_id: 'msg-1' },
      { gmail_message_id: 'msg-2' },
    ])

    const result = await getArchivedIds('acc-1')

    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(2)
    expect(result.has('msg-1')).toBe(true)
    expect(result.has('msg-2')).toBe(true)
  })

  it('returns empty set when no archived mails', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await getArchivedIds('acc-1')
    expect(result.size).toBe(0)
  })
})
