import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
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

const mockNotify = vi.fn()
vi.mock('../notifications/notify', () => ({ notify: (...args: any[]) => mockNotify(...args) }))

// Privacy mocks that invoke onProgress
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

// Unsubscribe mock that invokes onProgress
const mockScanNewsletters = vi.fn()
vi.mock('../unsubscribe/unsubscribe.service', () => ({
  scanNewsletters: (...args: any[]) => mockScanNewsletters(...args),
}))

// Archive/Gmail/Rules mocks (not the focus, but needed for imports)
vi.mock('../archive/archive.service', () => ({
  archiveMail: vi.fn(),
  getArchivedIds: vi.fn().mockResolvedValue(new Set()),
}))
vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [], nextPageToken: null }),
  trashMessages: vi.fn(),
  deleteMessages: vi.fn(),
  modifyMessages: vi.fn(),
}))
vi.mock('../rules/rules.service', () => ({
  getRule: vi.fn(),
  runRule: vi.fn(),
}))

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
  return { id, name, data, updateProgress: vi.fn() }
}

import { startPrivacyWorker } from '../jobs/workers/privacy.worker'
import { startUnsubscribeWorker } from '../jobs/workers/unsubscribe.worker'

// ═══════════════════════════════════════════════════════════
// PRIVACY WORKER - with onProgress callbacks invoked
// ═══════════════════════════════════════════════════════════
describe('privacy.worker - onProgress coverage', () => {
  it('scan_tracking invokes onProgress and updates DB progress', async () => {
    // Mock scanTrackingPixels to call onProgress
    mockScanTrackingPixels.mockImplementation(async (_accountId: string, opts: any) => {
      if (opts.onProgress) {
        await opts.onProgress(20, 100) // triggers progress update
        await opts.onProgress(40, 100) // triggers again (40 % 20 === 0)
      }
      return { scanned: 100, tracked: 3 }
    })

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
    })

    await handler(job)

    expect(job.updateProgress).toHaveBeenCalledWith(20)
    expect(job.updateProgress).toHaveBeenCalledWith(40)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'job_completed',
      title: 'Scan tracking terminé',
    }))
  })

  it('scan_pii invokes onProgress and notifies with integrity_alert when pii found', async () => {
    mockScanArchivePii.mockImplementation(async (_accountId: string, opts: any) => {
      if (opts.onProgress) {
        await opts.onProgress(20, 50)
      }
      return { scanned: 50, withPii: 5 }
    })

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })

    await handler(job)

    expect(job.updateProgress).toHaveBeenCalledWith(40)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'integrity_alert',
    }))
  })

  it('scan_pii notifies with job_completed when no pii found', async () => {
    mockScanArchivePii.mockImplementation(async (_accountId: string, opts: any) => {
      if (opts.onProgress) await opts.onProgress(10, 10)
      return { scanned: 10, withPii: 0 }
    })

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_pii', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_pii',
    })

    await handler(job)

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'job_completed',
    }))
  })

  it('encrypt_archives invokes onProgress and handles errors count', async () => {
    mockEncryptArchives.mockImplementation(async (_accountId: string, _pass: string, opts: any) => {
      if (opts.onProgress) {
        await opts.onProgress(10, 20) // 10 % 10 === 0 → updates DB
      }
      return { encrypted: 18, errors: 2 }
    })

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('encrypt_archives', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'encrypt_archives',
      passphrase: 'secret123',
    })

    await handler(job)

    expect(job.updateProgress).toHaveBeenCalledWith(50)
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Chiffrement terminé',
    }))
  })

  it('scan_tracking without userId does not notify', async () => {
    mockScanTrackingPixels.mockResolvedValue({ scanned: 10, tracked: 1 })

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      action: 'scan_tracking',
    })

    await handler(job)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('scan_tracking failure updates jobs to failed and notifies error', async () => {
    mockScanTrackingPixels.mockRejectedValue(new Error('scan failed'))

    startPrivacyWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_tracking', {
      accountId: 'acc-1',
      userId: 'user-1',
      action: 'scan_tracking',
    })

    await expect(handler(job)).rejects.toThrow('scan failed')
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      category: 'job_failed',
    }))
  })
})

// ═══════════════════════════════════════════════════════════
// UNSUBSCRIBE WORKER - with onProgress callback invoked
// ═══════════════════════════════════════════════════════════
describe('unsubscribe.worker - onProgress coverage', () => {
  it('scanNewsletters invokes onProgress callback', async () => {
    mockScanNewsletters.mockImplementation(async (_accountId: string, onProgress: any) => {
      if (onProgress) {
        await onProgress(5, 50)
        await onProgress(25, 50)
      }
      return [{ id: 'n1' }, { id: 'n2' }]
    })

    startUnsubscribeWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_unsubscribe', {
      accountId: 'acc-1',
      userId: 'user-1',
    })

    const result = await handler(job)

    expect(job.updateProgress).toHaveBeenCalledWith(10)
    expect(job.updateProgress).toHaveBeenCalledWith(50)
    expect(result).toHaveLength(2)
    // Verify DB insertInto + updateTable calls
    expect(mockExecute).toHaveBeenCalled()
  })

  it('scanNewsletters failure updates job status to failed', async () => {
    mockScanNewsletters.mockRejectedValue(new Error('Newsletter scan error'))

    startUnsubscribeWorker()
    const handler = capturedHandlers[capturedHandlers.length - 1]

    const job = createMockJob('scan_unsubscribe', {
      accountId: 'acc-1',
    })

    await expect(handler(job)).rejects.toThrow('Newsletter scan error')
    expect(mockExecute).toHaveBeenCalled()
  })
})
