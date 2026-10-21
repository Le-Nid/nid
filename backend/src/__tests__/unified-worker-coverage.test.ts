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

const mockCheckIntegrity = vi.fn()
vi.mock('../archive/integrity.service', () => ({
  checkArchiveIntegrity: (...args: any[]) => mockCheckIntegrity(...args),
}))

const mockLogAudit = vi.fn()
vi.mock('../audit/audit.service', () => ({ logAudit: (...args: any[]) => mockLogAudit(...args) }))

const mockEnqueueJob = vi.fn().mockResolvedValue({ id: 'archive_mails-next' })
vi.mock('../jobs/queue', () => ({ enqueueJob: (...args: any[]) => mockEnqueueJob(...args) }))

const mockPublishUserEvents = vi.fn().mockResolvedValue(undefined)
vi.mock('../events/events.service', () => ({ publishUserEvents: (...args: any[]) => mockPublishUserEvents(...args) }))

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
import { config } from '../config'

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

  it('runs bulk "delete" as trash (gmail.modify cannot delete permanently)', async () => {
    await processJob(makeJob('bulk_operation', { accountId: 'acc-1', action: 'delete', messageIds: ['msg-1'] }))
    expect(mockTrashMessages).toHaveBeenCalledWith('acc-1', ['msg-1'])
  })

  it('fails an unknown bulk action instead of reporting success', async () => {
    await expect(processJob(makeJob('bulk_operation', { accountId: 'acc-1', action: 'nope', messageIds: ['msg-1'] })))
      .rejects.toThrow('Unknown bulk action')
  })

  it('reports an archive job where every message failed as failed', async () => {
    mockArchiveMail.mockRejectedValue(new Error('token revoked'))
    await processJob(makeJob('archive_mails', { accountId: 'acc-1', userId: 'user-1', messageIds: ['m1', 'm2'], differential: false }))
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
    mockArchiveMail.mockResolvedValue(undefined)
  })

  it('runs integrity_check and alerts admins when unhealthy', async () => {
    mockCheckIntegrity.mockResolvedValueOnce({ totalRecords: 2, checkedFiles: 2, missingFiles: ['a'], orphanedFiles: [], corruptedFiles: [], healthy: false })
    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'admin-1' }])
    await processJob(makeJob('integrity_check', { accountId: '' }))
    expect(mockCheckIntegrity).toHaveBeenCalledWith(undefined)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-1', category: 'integrity_alert' }))
  })

  it('fails unknown job types instead of completing them silently', async () => {
    const job = makeJob('unknown_type', {})
    await expect(processJob(job)).rejects.toThrow('Unknown job type')
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

  // Ported from the deleted per-type worker tests
  it('fails label/unlabel without labelId', async () => {
    for (const action of ['label', 'unlabel']) {
      const job = makeJob('bulk_operation', { accountId: 'acc-1', action, messageIds: ['msg-1'] })
      await expect(processJob(job)).rejects.toThrow('labelId required')
    }
    expect(mockModifyMessages).not.toHaveBeenCalled()
  })

  it('reports privacy scan progress through onProgress', async () => {
    mockScanTrackingPixels.mockImplementationOnce(async (_acc: string, opts: any) => {
      await opts.onProgress(20, 100)
      await opts.onProgress(40, 100)
      return { scanned: 100, tracked: 3 }
    })
    const job = makeJob('scan_tracking', { accountId: 'acc-1', action: 'scan_tracking' })
    await processJob(job)
    expect(job.updateProgress).toHaveBeenCalledWith(20)
    expect(job.updateProgress).toHaveBeenCalledWith(40)
  })

  it('reports newsletter scan progress through onProgress', async () => {
    mockScanNewsletters.mockImplementationOnce(async (_acc: string, onProgress: any) => {
      await onProgress(5, 50)
      await onProgress(25, 50)
      return [{ id: 'n1' }, { id: 'n2' }]
    })
    const job = makeJob('scan_unsubscribe', { accountId: 'acc-1' })
    const result = await processJob(job)
    expect(job.updateProgress).toHaveBeenCalledWith(10)
    expect(job.updateProgress).toHaveBeenCalledWith(50)
    expect(result).toHaveLength(2)
  })
})

describe('bulk_operation by query (B5)', () => {
  let processJob: (job: any) => Promise<any>
  const page = (ids: string[], nextPageToken: string | null, resultSizeEstimate = 6) => ({
    messages: ids.map((id) => ({ id })), nextPageToken, resultSizeEstimate,
  })
  const withCap = async (cap: number, fn: () => Promise<void>) => {
    const saved = config.BULK_QUERY_MAX
    ;(config as any).BULK_QUERY_MAX = cap
    try { await fn() } finally { (config as any).BULK_QUERY_MAX = saved }
  }

  beforeEach(() => {
    processJob = (startUnifiedWorker() as any).processor
  })

  it('pages through messages.list and processes every page, then audits the real count', async () => {
    mockListMessages
      .mockResolvedValueOnce(page(['a', 'b', 'c'], 'p2'))
      .mockResolvedValueOnce(page(['d', 'e'], null))
    const job = makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'archive', query: 'from:x' })

    await processJob(job)

    expect(mockListMessages).toHaveBeenNthCalledWith(1, 'acc-1', { query: 'from:x', maxResults: 500, pageToken: undefined })
    expect(mockListMessages).toHaveBeenNthCalledWith(2, 'acc-1', { query: 'from:x', maxResults: 500, pageToken: 'p2' })
    expect(mockModifyMessages).toHaveBeenNthCalledWith(1, 'acc-1', ['a', 'b', 'c'], [], ['INBOX'])
    expect(mockModifyMessages).toHaveBeenNthCalledWith(2, 'acc-1', ['d', 'e'], [], ['INBOX'])
    expect(job.updateProgress).toHaveBeenNthCalledWith(1, 50) // 3 of Gmail's estimate of 6
    expect(job.updateProgress).toHaveBeenLastCalledWith(100) // 5 of 5 discovered
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'job_completed', data: expect.objectContaining({ count: 5, capped: false }),
    }))
    expect(mockLogAudit).toHaveBeenCalledWith('user-1', 'bulk.archive', expect.objectContaining({
      details: expect.objectContaining({ query: 'from:x', count: 5, capped: false }),
    }))
  })

  it('stops at BULK_QUERY_MAX and reports the cap', () => withCap(4, async () => {
    mockListMessages
      .mockResolvedValueOnce(page(['a', 'b', 'c'], 'p2'))
      .mockResolvedValueOnce(page(['d', 'e', 'f'], 'p3'))
    const job = makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'trash', query: 'older_than:1y' })

    await processJob(job)

    expect(mockListMessages).toHaveBeenCalledTimes(2) // never fetches p3
    expect(mockTrashMessages).toHaveBeenNthCalledWith(1, 'acc-1', ['a', 'b', 'c'])
    expect(mockTrashMessages).toHaveBeenNthCalledWith(2, 'acc-1', ['d'])
    expect(mockNotify).toHaveBeenCalledWith({
      userId: 'user-1',
      category: 'job_completed',
      title: 'Plafond atteint',
      body: "4 mails traités sur ~6 — relancez l'action pour traiter la suite.",
      data: { capped: true, jobId: 'job-1', query: 'older_than:1y', action: 'trash', labelId: null, processed: 4, remainingEstimate: 2 },
    })
    expect(mockEnqueueJob).not.toHaveBeenCalled() // never auto-relaunched
    expect(mockLogAudit).toHaveBeenCalledWith('user-1', 'bulk.trash', expect.objectContaining({
      details: expect.objectContaining({ count: 4, capped: true }),
    }))
  }))

  it('does not report a cap when the results end exactly at it', () => withCap(2, async () => {
    mockListMessages.mockResolvedValueOnce(page(['a', 'b'], null, 2))
    await processJob(makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'mark_read', query: 'is:unread' }))
    expect(mockLogAudit).toHaveBeenCalledWith('user-1', 'bulk.label', expect.objectContaining({
      details: expect.objectContaining({ count: 2, capped: false }),
    }))
  }))

  it('completes cleanly when the query matches nothing', async () => {
    mockListMessages.mockResolvedValueOnce(page([], null, 0))
    const job = makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'trash', query: 'from:nobody' })

    await processJob(job)

    expect(mockTrashMessages).not.toHaveBeenCalled()
    expect(job.updateProgress).toHaveBeenCalledWith(100)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_completed' }))
    expect(mockLogAudit).toHaveBeenCalledWith('user-1', 'bulk.trash', expect.objectContaining({
      details: expect.objectContaining({ count: 0 }),
    }))
  })

  it('audits what was processed before a failure', async () => {
    mockListMessages
      .mockResolvedValueOnce(page(['a'], 'p2'))
      .mockRejectedValueOnce(new Error('Gmail down'))
    const job = makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'trash', query: 'from:x' })

    await expect(processJob(job)).rejects.toThrow('Gmail down')
    expect(mockLogAudit).toHaveBeenCalledWith('user-1', 'bulk.trash', expect.objectContaining({
      details: expect.objectContaining({ count: 1 }),
    }))
  })

  it('keeps 50-id chunks and exact progress for explicit ids', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const job = makeJob('bulk_operation', { accountId: 'acc-1', action: 'trash', messageIds: ids })
    await processJob(job)
    expect(mockTrashMessages.mock.calls.map((c: any[]) => c[1].length)).toEqual([50, 50, 20])
    expect(job.updateProgress.mock.calls.map((c: any[]) => c[0])).toEqual([42, 83, 100])
  })

  it('does not audit id-based jobs (the route already did)', async () => {
    await processJob(makeJob('bulk_operation', { accountId: 'acc-1', userId: 'user-1', action: 'trash', messageIds: ['m1'] }))
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('archive_mails by query: cap and continuation', () => {
  let processJob: (job: any) => Promise<any>
  const withCap = async (cap: number, fn: () => Promise<void>) => {
    const saved = config.BULK_QUERY_MAX
    ;(config as any).BULK_QUERY_MAX = cap
    try { await fn() } finally { (config as any).BULK_QUERY_MAX = saved }
  }
  const listing = (ids: string[]) => mockListMessages.mockResolvedValueOnce({ messages: ids.map((id) => ({ id })), nextPageToken: null })

  beforeEach(() => {
    processJob = (startUnifiedWorker() as any).processor
  })

  it('archives up to the cap, enqueues a delayed differential continuation and tells the user', () => withCap(2, async () => {
    listing(['a', 'b', 'c', 'd'])
    mockGetArchivedIds.mockResolvedValueOnce(new Set(['a']))
    await processJob(makeJob('archive_mails', { accountId: 'acc-1', userId: 'user-1', query: 'label:x' }))

    expect(mockArchiveMail.mock.calls.map((c) => c[1])).toEqual(['b', 'c'])
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      'archive_mails',
      { accountId: 'acc-1', userId: 'user-1', query: 'label:x', differential: true, chain: 1 },
      { delay: 15 * 60_000 },
    )
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'job_completed',
      title: 'Sauvegarde partielle',
      body: 'Sauvegarde partielle : 2 mails sauvegardés, la suite reprend automatiquement dans 15 min.',
      data: expect.objectContaining({ capped: true, count: 2, continuationJobId: 'archive_mails-next' }),
    }))
  }))

  it('stops chaining once ARCHIVE_CHAIN_MAX runs are reached', () => withCap(1, async () => {
    listing(['a', 'b'])
    await processJob(makeJob('archive_mails', { accountId: 'acc-1', userId: 'user-1', query: 'q', chain: 20 }))
    expect(mockEnqueueJob).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('reprise automatique arrêtée'),
      data: expect.objectContaining({ capped: true, continuationJobId: null }),
    }))
  }))

  it('stops chaining when a run saved nothing new', () => withCap(1, async () => {
    listing(['a', 'b'])
    mockArchiveMail.mockRejectedValueOnce(new Error('NAS down'))
    await processJob(makeJob('archive_mails', { accountId: 'acc-1', userId: 'user-1', query: 'q', chain: 3 }))
    expect(mockEnqueueJob).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed', title: 'Sauvegarde partielle' }))
  }))

  it('does not cap an explicit messageIds list', () => withCap(1, async () => {
    await processJob(makeJob('archive_mails', { accountId: 'acc-1', userId: 'user-1', messageIds: ['a', 'b'], differential: false }))
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
    expect(mockEnqueueJob).not.toHaveBeenCalled()
  }))
})

describe('job lifecycle events (B3)', () => {
  it('publishes started/finished for jobs owned by a user, nothing otherwise', () => {
    const worker = startUnifiedWorker() as any
    worker.handlers.active({ id: 'j1', name: 'bulk_operation', data: { userId: 'u1', accountId: 'acc-1' } })
    worker.handlers.completed({ id: 'j1', name: 'bulk_operation', data: { userId: 'u1', accountId: 'acc-1' } })
    worker.handlers.failed({ id: 'j2', name: 'integrity_check', data: { userId: 'u1', accountId: '' }, failedReason: 'boom' }, new Error('boom'))
    worker.handlers.failed(undefined, new Error('stalled'))
    worker.handlers.active({ id: 'j3', name: 'integrity_check', data: { accountId: '' } })

    expect(mockPublishUserEvents).toHaveBeenCalledTimes(3)
    expect(mockPublishUserEvents).toHaveBeenNthCalledWith(1, 'u1', {
      event: 'job', data: { jobId: 'j1', type: 'bulk_operation', accountId: 'acc-1', phase: 'started', failed: false },
    })
    expect(mockPublishUserEvents).toHaveBeenNthCalledWith(3, 'u1', {
      event: 'job', data: { jobId: 'j2', type: 'integrity_check', accountId: null, phase: 'finished', failed: true },
    })
  })

  it('logs instead of throwing when publishing fails', async () => {
    mockPublishUserEvents.mockRejectedValueOnce(new Error('redis down'))
    const worker = startUnifiedWorker() as any
    expect(() => worker.handlers.active({ id: 'j1', name: 'x', data: { userId: 'u1' } })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})
