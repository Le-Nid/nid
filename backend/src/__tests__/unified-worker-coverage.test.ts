import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB + dependence mocks ──────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([])
const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return vi.fn().mockResolvedValue(null)
      return (..._args: any[]) => chain
    },
  })
  return chain
}
const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({}),
}))

const mockNotify = vi.fn()
vi.mock('../notifications/notify', () => ({ notify: (...args: any[]) => mockNotify(...args) }))

const mockArchiveMail = vi.fn().mockResolvedValue(undefined)
const mockGetArchivedIds = vi.fn().mockResolvedValue(new Set())
vi.mock('../archive/archive.service', () => ({
  archiveMail: (...args: any[]) => mockArchiveMail(...args),
  getArchivedIds: (...args: any[]) => mockGetArchivedIds(...args),
}))

const mockListMessages = vi.fn().mockResolvedValue({ messages: [], nextPageToken: null })
const mockTrashMessages = vi.fn().mockResolvedValue(undefined)
const mockModifyMessages = vi.fn().mockResolvedValue(undefined)
vi.mock('../gmail/gmail.service', () => ({
  listMessages: (...args: any[]) => mockListMessages(...args),
  trashMessages: (...args: any[]) => mockTrashMessages(...args),
  modifyMessages: (...args: any[]) => mockModifyMessages(...args),
}))

const mockGetRule = vi.fn()
const mockRunRule = vi.fn()
vi.mock('../rules/rules.service', () => ({
  getRule: (...args: any[]) => mockGetRule(...args),
  runRule: (...args: any[]) => mockRunRule(...args),
}))

const mockScanNewsletters = vi.fn().mockResolvedValue([])
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: (...args: any[]) => mockScanNewsletters(...args),
}))

const mockScanTrackingPixels = vi.fn().mockResolvedValue({ scanned: 10, tracked: 2 })
vi.mock('../privacy/tracking.service', () => ({
  scanTrackingPixels: (...args: any[]) => mockScanTrackingPixels(...args),
}))

const mockScanArchivePii = vi.fn().mockResolvedValue({ scanned: 10, withPii: 1 })
vi.mock('../privacy/pii.service', () => ({
  scanArchivePii: (...args: any[]) => mockScanArchivePii(...args),
}))

const mockEncryptArchives = vi.fn().mockResolvedValue({ encrypted: 5 })
vi.mock('../privacy/encryption.service', () => ({
  encryptArchives: (...args: any[]) => mockEncryptArchives(...args),
}))

const mockImportMbox = vi.fn().mockResolvedValue({ imported: 5, skipped: 1, errors: 0 })
const mockImportImap = vi.fn().mockResolvedValue({ imported: 3, skipped: 0, errors: 0 })
vi.mock('../archive/import.service', () => ({
  importMbox: (...args: any[]) => mockImportMbox(...args),
  importImap: (...args: any[]) => mockImportImap(...args),
}))

const mockApplyRetentionPolicies = vi.fn().mockResolvedValue({ policiesRun: 2, totalDeleted: 10 })
vi.mock('../archive/retention.service', () => ({
  applyRetentionPolicies: (...args: any[]) => mockApplyRetentionPolicies(...args),
}))

const mockPurgeArchiveTrash = vi.fn().mockResolvedValue({ deleted: 5 })
vi.mock('../archive/trash.service', () => ({
  purgeArchiveTrash: (...args: any[]) => mockPurgeArchiveTrash(...args),
}))

vi.mock('bullmq', () => {
  return {
    Worker: class MockWorker {
      name: string
      processor: any
      handlers: Record<string, Function> = {}
      constructor(name: string, processor: any, _opts: any) {
        this.name = name
        this.processor = processor
      }
      on(event: string, handler: Function) {
        this.handlers[event] = handler
        return this
      }
    },
  }
})

import { startUnifiedWorker } from '../jobs/workers/unified.worker'

beforeEach(() => vi.clearAllMocks())

function makeJob(name: string, data: any, id = 'job-1') {
  return {
    name,
    data,
    id,
    updateProgress: vi.fn(),
  }
}

describe('startUnifiedWorker', () => {
  it('creates a worker', () => {
    const worker = startUnifiedWorker()
    expect(worker).toBeDefined()
  })
})

describe('unified worker handlers', () => {
  let processJob: (job: any) => Promise<any>

  beforeEach(() => {
    const worker = startUnifiedWorker() as any
    processJob = worker.processor
  })

  it('handles archive_mails with messageIds', async () => {
    const job = makeJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      messageIds: ['msg-1', 'msg-2'],
      differential: false,
    })
    await processJob(job)
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles archive_mails with query and differential', async () => {
    mockListMessages.mockResolvedValueOnce({
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
      nextPageToken: null,
    })
    mockGetArchivedIds.mockResolvedValueOnce(new Set(['msg-1']))

    const job = makeJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      query: 'from:test',
      differential: true,
    })
    await processJob(job)
    // msg-1 is already archived, only msg-2 should be processed
    expect(mockArchiveMail).toHaveBeenCalledTimes(1)
  })

  it('handles bulk_operation trash', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })
    await processJob(job)
    expect(mockTrashMessages).toHaveBeenCalledWith('acc-1', ['msg-1'])
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles bulk_operation archive (remove INBOX label)', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'archive',
      messageIds: ['msg-1'],
    })
    await processJob(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['INBOX'])
  })

  it('handles bulk_operation mark_read', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_read',
      messageIds: ['msg-1'],
    })
    await processJob(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['UNREAD'])
  })

  it('handles bulk_operation mark_unread', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_unread',
      messageIds: ['msg-1'],
    })
    await processJob(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['UNREAD'], [])
  })

  it('handles bulk_operation label', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'label',
      messageIds: ['msg-1'],
      labelId: 'Label_1',
    })
    await processJob(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['Label_1'], [])
  })

  it('handles bulk_operation unlabel', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'unlabel',
      messageIds: ['msg-1'],
      labelId: 'Label_1',
    })
    await processJob(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['Label_1'])
  })

  it('handles bulk_operation failure', async () => {
    mockTrashMessages.mockRejectedValueOnce(new Error('Gmail error'))
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })
    await expect(processJob(job)).rejects.toThrow('Gmail error')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles run_rule success', async () => {
    mockGetRule.mockResolvedValue({ id: 'rule-1', name: 'Test Rule', is_active: true })
    mockRunRule.mockResolvedValue({ processed: 5 })

    const job = makeJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })
    const result = await processJob(job)
    expect(result).toEqual({ processed: 5 })
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'rule_executed' }))
  })

  it('handles run_rule not found', async () => {
    mockGetRule.mockResolvedValue(null)
    const job = makeJob('run_rule', { accountId: 'acc-1', ruleId: 'bad', userId: 'user-1' })
    await expect(processJob(job)).rejects.toThrow('Rule bad not found')
  })

  it('handles run_rule disabled', async () => {
    mockGetRule.mockResolvedValue({ id: 'rule-1', name: 'Test', is_active: false })
    const job = makeJob('run_rule', { accountId: 'acc-1', ruleId: 'rule-1', userId: 'user-1' })
    await expect(processJob(job)).rejects.toThrow('disabled')
  })

  it('handles scan_unsubscribe', async () => {
    const job = makeJob('scan_unsubscribe', { accountId: 'acc-1' })
    await processJob(job)
    expect(mockScanNewsletters).toHaveBeenCalled()
  })

  it('handles scan_tracking', async () => {
    const job = makeJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
      maxMessages: 100,
    })
    await processJob(job)
    expect(mockScanTrackingPixels).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles scan_pii', async () => {
    const job = makeJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })
    await processJob(job)
    expect(mockScanArchivePii).toHaveBeenCalled()
  })

  it('handles encrypt_archives', async () => {
    const job = makeJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'my-secret',
    })
    await processJob(job)
    expect(mockEncryptArchives).toHaveBeenCalled()
  })

  it('handles encrypt_archives without passphrase', async () => {
    const job = makeJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
    })
    await expect(processJob(job)).rejects.toThrow('Passphrase required')
  })

  it('handles import_mbox', async () => {
    const job = makeJob('import_mbox', {
      accountId: 'acc-1',
      userId: 'user-1',
      filePath: '/tmp/test.mbox',
    })
    // Mock fs.unlink for cleanup
    vi.doMock('fs/promises', () => ({ unlink: vi.fn() }))
    const result = await processJob(job)
    expect(result).toEqual({ imported: 5, skipped: 1, errors: 0 })
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles import_mbox failure', async () => {
    mockImportMbox.mockRejectedValueOnce(new Error('Parse error'))
    const job = makeJob('import_mbox', {
      accountId: 'acc-1',
      userId: 'user-1',
      filePath: '/tmp/bad.mbox',
    })
    await expect(processJob(job)).rejects.toThrow('Parse error')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles import_imap', async () => {
    const job = makeJob('import_imap', {
      accountId: 'acc-1',
      userId: 'user-1',
      imapConfig: { host: 'imap.test.com', port: 993, user: 'u', pass: 'p' },
    })
    const result = await processJob(job)
    expect(result).toEqual({ imported: 3, skipped: 0, errors: 0 })
  })

  it('handles import_imap failure', async () => {
    mockImportImap.mockRejectedValueOnce(new Error('Connection refused'))
    const job = makeJob('import_imap', {
      accountId: 'acc-1',
      userId: 'user-1',
      imapConfig: { host: 'imap.test.com', port: 993, user: 'u', pass: 'p' },
    })
    await expect(processJob(job)).rejects.toThrow('Connection refused')
  })

  it('handles apply_retention', async () => {
    const job = makeJob('apply_retention', { userId: 'user-1' })
    const result = await processJob(job)
    expect(result).toEqual({ policiesRun: 2, totalDeleted: 10 })
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles apply_retention failure', async () => {
    mockApplyRetentionPolicies.mockRejectedValueOnce(new Error('DB error'))
    const job = makeJob('apply_retention', { userId: 'user-1' })
    await expect(processJob(job)).rejects.toThrow('DB error')
  })

  it('handles purge_archive_trash', async () => {
    const job = makeJob('purge_archive_trash', {})
    const result = await processJob(job)
    expect(result).toEqual({ deleted: 5 })
    expect(mockPurgeArchiveTrash).toHaveBeenCalled()
  })

  it('handles purge_archive_trash failure', async () => {
    mockPurgeArchiveTrash.mockRejectedValueOnce(new Error('Purge failed'))
    const job = makeJob('purge_archive_trash', {})
    await expect(processJob(job)).rejects.toThrow('Purge failed')
  })

  it('handles unknown job type gracefully', async () => {
    const job = makeJob('unknown_type', {})
    await expect(processJob(job)).resolves.not.toThrow()
  })

  it('handles privacy failure with notification', async () => {
    mockScanTrackingPixels.mockRejectedValueOnce(new Error('Scan failed'))
    const job = makeJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
    })
    await expect(processJob(job)).rejects.toThrow('Scan failed')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  // ─── Additional branch coverage ──────────────────────────

  it('handles archive_mails without userId (no notification)', async () => {
    const job = makeJob('archive_mails', {
      accountId: 'acc-1',
      messageIds: ['msg-1'],
      differential: false,
    })
    await processJob(job)
    expect(mockArchiveMail).toHaveBeenCalledTimes(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles archive_mails with archiveMail error (continues)', async () => {
    mockArchiveMail.mockRejectedValueOnce(new Error('archive error'))
    const job = makeJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      messageIds: ['msg-1'],
      differential: false,
    })
    await processJob(job)
    // Should not throw, error is logged and processing continues
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles archive_mails query mode with pagination', async () => {
    mockListMessages
      .mockResolvedValueOnce({
        messages: [{ id: 'msg-1' }],
        nextPageToken: 'token-2',
      })
      .mockResolvedValueOnce({
        messages: [{ id: 'msg-2' }],
        nextPageToken: null,
      })
    mockGetArchivedIds.mockResolvedValueOnce(new Set())

    const job = makeJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      query: 'from:test',
      differential: true,
    })
    await processJob(job)
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
  })

  it('handles bulk_operation without userId (no notify)', async () => {
    const job = makeJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })
    await processJob(job)
    expect(mockTrashMessages).toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles run_rule without userId (no notify)', async () => {
    mockGetRule.mockResolvedValue({ id: 'rule-1', name: 'Test', is_active: true })
    mockRunRule.mockResolvedValue({ processed: 3 })
    const job = makeJob('run_rule', { accountId: 'acc-1', ruleId: 'rule-1' })
    const result = await processJob(job)
    expect(result).toEqual({ processed: 3 })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles scan_unsubscribe failure', async () => {
    mockScanNewsletters.mockRejectedValueOnce(new Error('scan error'))
    const job = makeJob('scan_unsubscribe', { accountId: 'acc-1' })
    await expect(processJob(job)).rejects.toThrow('scan error')
  })

  it('handles scan_pii with userId', async () => {
    const job = makeJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })
    await processJob(job)
    expect(mockScanArchivePii).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_completed' }))
  })

  it('handles scan_tracking without userId (no notify)', async () => {
    const job = makeJob('scan_tracking', {
      accountId: 'acc-1',
      action: 'scan_tracking',
    })
    await processJob(job)
    expect(mockScanTrackingPixels).toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles encrypt_archives with userId', async () => {
    const job = makeJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'secret',
    })
    await processJob(job)
    expect(mockEncryptArchives).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_completed' }))
  })

  it('handles import_mbox without userId (no notify)', async () => {
    const job = makeJob('import_mbox', {
      accountId: 'acc-1',
      filePath: '/tmp/test.mbox',
    })
    const result = await processJob(job)
    expect(result).toEqual({ imported: 5, skipped: 1, errors: 0 })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles import_imap without userId (no notify)', async () => {
    const job = makeJob('import_imap', {
      accountId: 'acc-1',
      imapConfig: { host: 'imap.test.com', port: 993, user: 'u', pass: 'p' },
    })
    const result = await processJob(job)
    expect(result).toEqual({ imported: 3, skipped: 0, errors: 0 })
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('handles import_imap failure with userId', async () => {
    mockImportImap.mockRejectedValueOnce(new Error('IMAP fail'))
    const job = makeJob('import_imap', {
      accountId: 'acc-1',
      userId: 'user-1',
      imapConfig: { host: 'imap.test.com', port: 993, user: 'u', pass: 'p' },
    })
    await expect(processJob(job)).rejects.toThrow('IMAP fail')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles import_mbox failure with userId', async () => {
    mockImportMbox.mockRejectedValueOnce(new Error('mbox fail'))
    const job = makeJob('import_mbox', {
      accountId: 'acc-1',
      userId: 'user-1',
      filePath: '/tmp/bad.mbox',
    })
    await expect(processJob(job)).rejects.toThrow('mbox fail')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles privacy scan_pii failure with userId', async () => {
    mockScanArchivePii.mockRejectedValueOnce(new Error('PII fail'))
    const job = makeJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })
    await expect(processJob(job)).rejects.toThrow('PII fail')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles encrypt_archives failure with userId', async () => {
    mockEncryptArchives.mockRejectedValueOnce(new Error('Encrypt fail'))
    const job = makeJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'secret',
    })
    await expect(processJob(job)).rejects.toThrow('Encrypt fail')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })
})
