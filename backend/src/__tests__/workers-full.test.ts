import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([])
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

const mockNotify = vi.fn()
vi.mock('../notifications/notify', () => ({ notify: (...args: any[]) => mockNotify(...args) }))

const mockArchiveMail = vi.fn()
const mockGetArchivedIds = vi.fn().mockResolvedValue(new Set())
vi.mock('../archive/archive.service', () => ({
  archiveMail: (...args: any[]) => mockArchiveMail(...args),
  getArchivedIds: (...args: any[]) => mockGetArchivedIds(...args),
}))

const mockListMessages = vi.fn()
const mockTrashMessages = vi.fn()
const mockModifyMessages = vi.fn()
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

const mockScanNewsletters = vi.fn()
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: (...args: any[]) => mockScanNewsletters(...args),
}))

const mockScanTrackingPixels = vi.fn()
vi.mock('../privacy/tracking.service', () => ({
  scanTrackingPixels: (...args: any[]) => mockScanTrackingPixels(...args),
}))

const mockScanArchivePii = vi.fn()
vi.mock('../privacy/pii.service', () => ({
  scanArchivePii: (...args: any[]) => mockScanArchivePii(...args),
}))

const mockEncryptArchives = vi.fn()
vi.mock('../privacy/encryption.service', () => ({
  encryptArchives: (...args: any[]) => mockEncryptArchives(...args),
}))

// Capture worker handler
let capturedHandler: (job: any) => Promise<any>
vi.mock('bullmq', () => {
  class MockWorker {
    constructor(_name: string, handler: (job: any) => Promise<any>) {
      capturedHandler = handler
    }
    on() { return this }
    close() {}
  }
  class MockQueueEvents {
    constructor() {}
    on() { return this }
  }
  return { Worker: MockWorker, Queue: vi.fn(), QueueEvents: MockQueueEvents }
})

vi.mock('../plugins/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }),
}))

beforeEach(() => vi.clearAllMocks())

function createMockJob(name: string, data: any, id = 'job-1') {
  return {
    id,
    name,
    data,
    updateProgress: vi.fn(),
  }
}

describe('unified worker handlers', () => {
  it('handles archive_mails job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockListMessages.mockResolvedValue({ messages: [{ id: 'msg-1' }], nextPageToken: null })
    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      messageIds: ['msg-1', 'msg-2'],
    })

    await capturedHandler(job)
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles bulk_operation trash', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockTrashMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1', 'msg-2'],
    })

    await capturedHandler(job)
    expect(mockTrashMessages).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles bulk_operation archive', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'archive',
      messageIds: ['msg-1'],
    })

    await capturedHandler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['INBOX'])
  })

  it('handles bulk_operation mark_read', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_read',
      messageIds: ['msg-1'],
    })

    await capturedHandler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['UNREAD'])
  })

  it('handles bulk_operation mark_unread', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_unread',
      messageIds: ['msg-1'],
    })

    await capturedHandler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['UNREAD'], [])
  })

  it('handles bulk_operation label', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'label',
      messageIds: ['msg-1'],
      labelId: 'Label_1',
    })

    await capturedHandler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['Label_1'], [])
  })

  it('handles bulk_operation unlabel', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'unlabel',
      messageIds: ['msg-1'],
      labelId: 'Label_1',
    })

    await capturedHandler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['Label_1'])
  })

  it('handles bulk_operation failure', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockTrashMessages.mockRejectedValue(new Error('API error'))

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })

    await expect(capturedHandler(job)).rejects.toThrow('API error')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))
  })

  it('handles run_rule job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockGetRule.mockResolvedValue({ id: 'rule-1', name: 'Test Rule', is_active: true })
    mockRunRule.mockResolvedValue({ processed: 5 })

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })

    await capturedHandler(job)
    expect(mockRunRule).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles run_rule with missing rule', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockGetRule.mockResolvedValue(null)

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      ruleId: 'missing',
    })

    await expect(capturedHandler(job)).rejects.toThrow('not found')
  })

  it('handles scan_unsubscribe job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockScanNewsletters.mockResolvedValue([{ sender: 'test', count: 5 }])

    const job = createMockJob('scan_unsubscribe', {
      accountId: 'acc-1',
    })

    await capturedHandler(job)
    expect(mockScanNewsletters).toHaveBeenCalled()
  })

  it('handles scan_tracking job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockScanTrackingPixels.mockResolvedValue({ scanned: 10, tracked: 2, newFindings: 2 })

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
    })

    await capturedHandler(job)
    expect(mockScanTrackingPixels).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles scan_pii job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockScanArchivePii.mockResolvedValue({ scanned: 5, withPii: 1, findings: 3 })

    const job = createMockJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })

    await capturedHandler(job)
    expect(mockScanArchivePii).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles encrypt_archives job', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockEncryptArchives.mockResolvedValue({ encrypted: 10, errors: 0 })

    const job = createMockJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'secret',
    })

    await capturedHandler(job)
    expect(mockEncryptArchives).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalled()
  })

  it('handles encrypt_archives without passphrase', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    const job = createMockJob('encrypt_archives', {
      accountId: 'acc-1',
      action: 'encrypt_archives',
    })

    await expect(capturedHandler(job)).rejects.toThrow('Passphrase')
  })

  it('handles unknown job type', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    const job = createMockJob('unknown_type', { accountId: 'acc-1' })
    await capturedHandler(job) // Should log warning but not throw
    expect(capturedHandler).toBeDefined()
  })

  it('handles archive_mails with differential', async () => {
    const { startUnifiedWorker } = await import('../jobs/workers/unified.worker')
    startUnifiedWorker()

    mockListMessages.mockResolvedValue({ messages: [{ id: 'msg-1' }, { id: 'msg-2' }], nextPageToken: null })
    mockGetArchivedIds.mockResolvedValue(new Set(['msg-1']))
    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      differential: true,
    })

    await capturedHandler(job)
    // Only msg-2 should be archived (msg-1 is already archived)
    expect(mockArchiveMail).toHaveBeenCalledTimes(1)
    expect(mockArchiveMail).toHaveBeenCalledWith('acc-1', 'msg-2')
  })
})
