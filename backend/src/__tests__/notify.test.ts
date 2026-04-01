import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const mockShouldNotify = vi.fn()
vi.mock('../notifications/notification-prefs.service', () => ({
  shouldNotify: (...args: any[]) => mockShouldNotify(...args),
}))

const mockTriggerWebhooks = vi.fn()
vi.mock('../webhooks/webhook.service', () => ({
  triggerWebhooks: (...args: any[]) => mockTriggerWebhooks(...args),
}))

vi.mock('pino', () => ({ default: () => ({ error: vi.fn(), info: vi.fn() }) }))

import { notify } from '../notifications/notify'

beforeEach(() => vi.clearAllMocks())

describe('notify', () => {
  it('creates in-app notification when enabled', async () => {
    mockShouldNotify.mockResolvedValue(true)
    mockExecute.mockResolvedValue([])
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({
      userId: 'user-1',
      category: 'job_completed',
      title: 'Job done',
      body: 'All ok',
    })

    expect(mockShouldNotify).toHaveBeenCalledWith('user-1', 'job_completed')
    expect(mockExecute).toHaveBeenCalled()
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      'user-1',
      'job.completed',
      expect.objectContaining({ title: 'Job done' }),
    )
  })

  it('skips in-app notification when disabled', async () => {
    mockShouldNotify.mockResolvedValue(false)
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({
      userId: 'user-1',
      category: 'rule_executed',
      title: 'Rule ran',
    })

    expect(mockShouldNotify).toHaveBeenCalled()
    // DB insert should not be called for in-app notification
  })

  it('still triggers webhooks even when in-app disabled', async () => {
    mockShouldNotify.mockResolvedValue(false)
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({
      userId: 'user-1',
      category: 'job_failed',
      title: 'Job failed',
    })

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      'user-1',
      'job.failed',
      expect.objectContaining({ title: 'Job failed' }),
    )
  })

  it('does not throw when in-app notification fails', async () => {
    mockShouldNotify.mockRejectedValue(new Error('DB error'))
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await expect(
      notify({ userId: 'user-1', category: 'job_completed', title: 'Test' }),
    ).resolves.toBeUndefined()
  })

  it('does not throw when webhook trigger fails', async () => {
    mockShouldNotify.mockResolvedValue(true)
    mockExecute.mockResolvedValue([])
    mockTriggerWebhooks.mockRejectedValue(new Error('Webhook error'))

    await expect(
      notify({ userId: 'user-1', category: 'job_completed', title: 'Test' }),
    ).resolves.toBeUndefined()
  })

  it('maps weekly_report to job.completed webhook event', async () => {
    mockShouldNotify.mockResolvedValue(false)
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({ userId: 'u1', category: 'weekly_report', title: 'Report' })
    expect(mockTriggerWebhooks).toHaveBeenCalledWith('u1', 'job.completed', expect.anything())
  })

  it('maps quota_warning to quota.warning webhook event', async () => {
    mockShouldNotify.mockResolvedValue(false)
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({ userId: 'u1', category: 'quota_warning', title: 'Quota' })
    expect(mockTriggerWebhooks).toHaveBeenCalledWith('u1', 'quota.warning', expect.anything())
  })

  it('includes data in webhook payload', async () => {
    mockShouldNotify.mockResolvedValue(false)
    mockTriggerWebhooks.mockResolvedValue(undefined)

    await notify({
      userId: 'u1',
      category: 'job_completed',
      title: 'Done',
      data: { jobId: 'j1', count: 10 },
    })

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      'u1',
      'job.completed',
      expect.objectContaining({ jobId: 'j1', count: 10 }),
    )
  })
})
