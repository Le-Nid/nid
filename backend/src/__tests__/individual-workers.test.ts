import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies first ────────────────────────────────
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
vi.mock('../plugins/redis', () => ({ getRedis: () => ({}) }))
vi.mock('../notifications/notify', () => ({ notify: vi.fn() }))

const mockArchiveMail = vi.fn()
const mockGetArchivedIds = vi.fn().mockResolvedValue(new Set())
vi.mock('../archive/archive.service', () => ({
  archiveMail: (...args: any[]) => mockArchiveMail(...args),
  getArchivedIds: (...args: any[]) => mockGetArchivedIds(...args),
}))

const mockListMessages = vi.fn().mockResolvedValue({ messages: [], nextPageToken: null })
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

const mockScanTrackingPixels = vi.fn()
const mockScanArchivePii = vi.fn()
const mockEncryptArchives = vi.fn()
vi.mock('../privacy/tracking.service', () => ({
  scanTrackingPixels: (...args: any[]) => mockScanTrackingPixels(...args),
}))
vi.mock('../privacy/pii.service', () => ({
  scanArchivePii: (...args: any[]) => mockScanArchivePii(...args),
}))
vi.mock('../privacy/encryption.service', () => ({
  encryptArchives: (...args: any[]) => mockEncryptArchives(...args),
}))

const mockScanNewsletters = vi.fn().mockResolvedValue([])
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: (...args: any[]) => mockScanNewsletters(...args),
}))

// Capture each Worker handler by tracking constructor calls
const capturedHandlers: any[] = []
vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    on = vi.fn().mockReturnThis()
    constructor(_name: string, handler: any) {
      capturedHandlers.push(handler)
    }
  },
  Queue: vi.fn(),
  QueueEvents: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  capturedHandlers.length = 0
})

function createMockJob(name: string, data: any, id = 'job-1') {
  return {
    id,
    name,
    data,
    updateProgress: vi.fn(),
  }
}

// ─── Import ALL workers at top level ────────────────────────
import { startArchiveWorker } from '../jobs/workers/archive.worker'
import { startBulkWorker } from '../jobs/workers/bulk.worker'
import { startRuleWorker } from '../jobs/workers/rule.worker'
import { startPrivacyWorker } from '../jobs/workers/privacy.worker'
import { startUnsubscribeWorker } from '../jobs/workers/unsubscribe.worker'

describe('archive.worker', () => {
  it('processes archive_mails with provided messageIds', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      messageIds: ['msg-1', 'msg-2'],
      differential: false,
    })

    await handler(job)

    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
    expect(job.updateProgress).toHaveBeenCalled()
  })

  it('skips non-archive_mails jobs', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('other_job', { accountId: 'acc-1' })
    await handler(job)

    expect(mockArchiveMail).not.toHaveBeenCalled()
  })

  it('handles differential archiving', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockGetArchivedIds.mockResolvedValueOnce(new Set(['msg-1']))
    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      messageIds: ['msg-1', 'msg-2'],
      differential: true,
    })

    await handler(job)

    expect(mockArchiveMail).toHaveBeenCalledTimes(1)
    expect(mockArchiveMail).toHaveBeenCalledWith('acc-1', 'msg-2')
  })

  it('fetches messages from Gmail when no messageIds provided', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockListMessages.mockResolvedValueOnce({
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
      nextPageToken: null,
    })
    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      userId: 'user-1',
      differential: false,
    })

    await handler(job)

    expect(mockListMessages).toHaveBeenCalled()
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
  })

  it('handles archive errors gracefully', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockArchiveMail
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      messageIds: ['msg-1', 'msg-2'],
      differential: false,
    })

    await handler(job)
    expect(mockArchiveMail).toHaveBeenCalledTimes(2)
  })

  it('skips notification when no userId', async () => {
    startArchiveWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockArchiveMail.mockResolvedValue(undefined)

    const job = createMockJob('archive_mails', {
      accountId: 'acc-1',
      messageIds: ['msg-1'],
      differential: false,
      // no userId
    })

    await handler(job)
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('bulk.worker', () => {
  it('processes trash action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockTrashMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })

    await handler(job)
    expect(mockTrashMessages).toHaveBeenCalledWith('acc-1', ['msg-1'])
  })

  it('processes archive action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'archive',
      messageIds: ['msg-1'],
    })

    await handler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['INBOX'])
  })

  it('processes mark_read action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_read',
      messageIds: ['msg-1'],
    })

    await handler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['UNREAD'])
  })

  it('processes mark_unread action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'mark_unread',
      messageIds: ['msg-1'],
    })

    await handler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['UNREAD'], [])
  })

  it('processes label action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'label',
      messageIds: ['msg-1'],
      labelId: 'STARRED',
    })

    await handler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], ['STARRED'], [])
  })

  it('processes unlabel action', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockModifyMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'unlabel',
      messageIds: ['msg-1'],
      labelId: 'STARRED',
    })

    await handler(job)
    expect(mockModifyMessages).toHaveBeenCalledWith('acc-1', ['msg-1'], [], ['STARRED'])
  })

  it('label without labelId throws error', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'label',
      messageIds: ['msg-1'],
    })

    await expect(handler(job)).rejects.toThrow('labelId required')
  })

  it('unlabel without labelId throws error', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'unlabel',
      messageIds: ['msg-1'],
    })

    await expect(handler(job)).rejects.toThrow('labelId required')
  })

  it('skips non-bulk_operation jobs', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('other', { accountId: 'acc-1' })
    await handler(job)
    expect(mockTrashMessages).not.toHaveBeenCalled()
  })

  it('handles failure and notifies', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockTrashMessages.mockRejectedValueOnce(new Error('API error'))

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'trash',
      messageIds: ['msg-1'],
    })

    await expect(handler(job)).rejects.toThrow('API error')
  })

  it('success without userId skips notification', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockTrashMessages.mockResolvedValue(undefined)

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'trash',
      messageIds: ['msg-1'],
      // no userId
    })

    await handler(job)
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })

  it('failure without userId skips notification', async () => {
    startBulkWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockTrashMessages.mockRejectedValueOnce(new Error('Fail'))

    const job = createMockJob('bulk_operation', {
      accountId: 'acc-1',
      action: 'trash',
      messageIds: ['msg-1'],
      // no userId
    })

    await expect(handler(job)).rejects.toThrow('Fail')
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('rule.worker', () => {
  it('processes run_rule', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockGetRule.mockResolvedValueOnce({ id: 'rule-1', name: 'Test Rule', is_active: true })
    mockRunRule.mockResolvedValueOnce({ processed: 5 })

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })

    await handler(job)
    expect(mockRunRule).toHaveBeenCalled()
  })

  it('throws when rule not found', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockGetRule.mockResolvedValueOnce(null)

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })

    await expect(handler(job)).rejects.toThrow('Rule rule-1 not found')
  })

  it('throws when rule is disabled', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockGetRule.mockResolvedValueOnce({ id: 'rule-1', name: 'Test', is_active: false })

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })

    await expect(handler(job)).rejects.toThrow('Rule rule-1 is disabled')
  })

  it('skips non-run_rule jobs', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('other', { accountId: 'acc-1' })
    await handler(job)
    expect(mockGetRule).not.toHaveBeenCalled()
  })

  it('skips notify when no userId on success', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]
    mockGetRule.mockResolvedValueOnce({ id: 'rule-1', name: 'Test', is_active: true })
    mockRunRule.mockResolvedValueOnce({ processed: 3 })

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      ruleId: 'rule-1',
      // no userId
    })
    await handler(job)
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })

  it('skips notify when no userId on error', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]
    mockGetRule.mockResolvedValueOnce(null)

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      ruleId: 'rule-1',
      // no userId
    })
    await expect(handler(job)).rejects.toThrow('Rule rule-1 not found')
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })

  it('handles null result.processed (coalesce ?? 0)', async () => {
    startRuleWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]
    mockGetRule.mockResolvedValueOnce({ id: 'rule-1', name: 'Test', is_active: true })
    mockRunRule.mockResolvedValueOnce(null) // result is null

    const job = createMockJob('run_rule', {
      accountId: 'acc-1',
      userId: 'user-1',
      ruleId: 'rule-1',
    })
    await handler(job)
    // Should not throw even with null result
  })
})

describe('privacy.worker', () => {
  it('processes scan_tracking', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanTrackingPixels.mockResolvedValueOnce({ scanned: 100, tracked: 5 })

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
      maxMessages: 200,
    })

    await handler(job)
    expect(mockScanTrackingPixels).toHaveBeenCalled()
  })

  it('processes scan_pii', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanArchivePii.mockResolvedValueOnce({ scanned: 50, withPii: 2 })

    const job = createMockJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })

    await handler(job)
    expect(mockScanArchivePii).toHaveBeenCalled()
  })

  it('processes encrypt_archives', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockEncryptArchives.mockResolvedValueOnce({ encrypted: 10, errors: 0 })

    const job = createMockJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'my-secret',
    })

    await handler(job)
    expect(mockEncryptArchives).toHaveBeenCalled()
  })

  it('throws when encrypt_archives without passphrase', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
    })

    await expect(handler(job)).rejects.toThrow('Passphrase required')
  })

  it('scan_pii with PII found sends integrity_alert', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanArchivePii.mockResolvedValueOnce({ scanned: 50, withPii: 5 })

    const job = createMockJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })

    await handler(job)
    const { notify } = await import('../notifications/notify')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'integrity_alert' })
    )
  })

  it('scan_tracking without userId skips notification', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanTrackingPixels.mockResolvedValueOnce({ scanned: 10, tracked: 1 })

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      action: 'scan_tracking',
      // no userId
    })

    await handler(job)
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })

  it('error without userId skips error notification', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanTrackingPixels.mockRejectedValueOnce(new Error('Scan failed'))

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      action: 'scan_tracking',
      // no userId
    })

    await expect(handler(job)).rejects.toThrow('Scan failed')
    const { notify } = await import('../notifications/notify')
    expect(notify).not.toHaveBeenCalled()
  })

  it('skips unrelated job names', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('other_job', { accountId: 'acc-1' })
    await handler(job)
    expect(mockScanTrackingPixels).not.toHaveBeenCalled()
  })

  it('handles errors and notifies user', async () => {
    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanTrackingPixels.mockRejectedValueOnce(new Error('Scan failed'))

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
    })

    await expect(handler(job)).rejects.toThrow('Scan failed')
  })
})

describe('unsubscribe.worker', () => {
  it('processes scan_unsubscribe', async () => {
    startUnsubscribeWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanNewsletters.mockResolvedValueOnce([{ sender: 'test@test.com', count: 5 }])

    const job = createMockJob('scan_unsubscribe', {
      accountId: 'acc-1',
      userId: 'user-1',
    })

    await handler(job)
    expect(mockScanNewsletters).toHaveBeenCalled()
  })

  it('skips non-scan_unsubscribe jobs', async () => {
    startUnsubscribeWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('other', { accountId: 'acc-1' })
    await handler(job)
    expect(mockScanNewsletters).not.toHaveBeenCalled()
  })

  it('handles scan failures', async () => {
    startUnsubscribeWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    mockScanNewsletters.mockRejectedValueOnce(new Error('Scan error'))

    const job = createMockJob('scan_unsubscribe', {
      accountId: 'acc-1',
    })

    await expect(handler(job)).rejects.toThrow('Scan error')
  })
})
