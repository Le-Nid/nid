import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB mock ──────────────────────────────────────────────
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

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('../storage/storage.service', () => ({
  getStorageForUser: vi.fn().mockResolvedValue(mockStorage),
}))

import {
  applyRetentionPolicies,
  getRetentionPolicies,
  createRetentionPolicy,
  updateRetentionPolicy,
  deleteRetentionPolicy,
} from '../archive/retention.service'

beforeEach(() => vi.clearAllMocks())

describe('getRetentionPolicies', () => {
  it('queries policies for the given user', async () => {
    mockExecute.mockResolvedValueOnce([{ id: 'p1', name: 'Clean old' }])
    const result = await getRetentionPolicies('user-1')
    expect(result).toEqual([{ id: 'p1', name: 'Clean old' }])
    expect(mockExecute).toHaveBeenCalled()
  })
})

describe('createRetentionPolicy', () => {
  it('inserts a new policy with all fields', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'p2',
      name: 'Test',
      max_age_days: 90,
      gmail_account_id: 'acc-1',
      label: 'INBOX',
    })
    const result = await createRetentionPolicy({
      userId: 'user-1',
      gmailAccountId: 'acc-1',
      name: 'Test',
      label: 'INBOX',
      maxAgeDays: 90,
    })
    expect(result.id).toBe('p2')
    expect(result.name).toBe('Test')
  })

  it('inserts with optional fields as null', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'p3',
      name: 'Simple',
      max_age_days: 30,
      gmail_account_id: null,
      label: null,
    })
    const result = await createRetentionPolicy({
      userId: 'user-1',
      name: 'Simple',
      maxAgeDays: 30,
    })
    expect(result.gmail_account_id).toBeNull()
    expect(result.label).toBeNull()
  })
})

describe('updateRetentionPolicy', () => {
  it('updates name field', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'p1', name: 'Updated' })
    const result = await updateRetentionPolicy('p1', 'user-1', { name: 'Updated' })
    expect(result.name).toBe('Updated')
  })

  it('updates label field (empty string → null)', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'p1', label: null })
    const result = await updateRetentionPolicy('p1', 'user-1', { label: '' })
    expect(result.label).toBeNull()
  })

  it('updates maxAgeDays field', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'p1', max_age_days: 60 })
    const result = await updateRetentionPolicy('p1', 'user-1', { maxAgeDays: 60 })
    expect(result.max_age_days).toBe(60)
  })

  it('updates isActive field', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id: 'p1', is_active: false })
    const result = await updateRetentionPolicy('p1', 'user-1', { isActive: false })
    expect(result.is_active).toBe(false)
  })
})

describe('deleteRetentionPolicy', () => {
  it('deletes a policy by id and userId', async () => {
    mockExecute.mockResolvedValueOnce([])
    await deleteRetentionPolicy('p1', 'user-1')
    expect(mockExecute).toHaveBeenCalled()
  })
})

describe('applyRetentionPolicies', () => {
  it('returns zero counts when no active policies', async () => {
    mockExecute.mockResolvedValueOnce([]) // no active policies
    const result = await applyRetentionPolicies()
    expect(result).toEqual({ policiesRun: 0, totalDeleted: 0 })
  })

  it('deletes matching archived mails and updates policy stats', async () => {
    const policy = {
      id: 'p1',
      user_id: 'user-1',
      name: 'Clean old',
      gmail_account_id: null,
      label: null,
      max_age_days: 90,
      is_active: true,
      deleted_count: 5,
    }
    // First call: selectFrom('retention_policies') → returns policies
    mockExecute
      .mockResolvedValueOnce([policy]) // policies
      .mockResolvedValueOnce([
        { id: 'mail-1', eml_path: '/tmp/1.eml', gmail_account_id: 'acc-1' },
        { id: 'mail-2', eml_path: '/tmp/2.eml', gmail_account_id: 'acc-1' },
      ]) // matching mails
      .mockResolvedValueOnce([{ id: 'att-1', file_path: '/tmp/att1.pdf' }]) // attachments
      .mockResolvedValueOnce([]) // delete attachments
      .mockResolvedValueOnce([]) // delete archived_mails
      .mockResolvedValueOnce([]) // update policy stats

    const result = await applyRetentionPolicies()
    expect(result.policiesRun).toBe(1)
    expect(result.totalDeleted).toBe(2)
    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(3) // 1 attachment + 2 eml files
  })

  it('handles policy with gmail_account_id filter', async () => {
    const policy = {
      id: 'p2',
      user_id: 'user-1',
      name: 'Account specific',
      gmail_account_id: 'acc-1',
      label: null,
      max_age_days: 30,
      is_active: true,
      deleted_count: 0,
    }
    mockExecute
      .mockResolvedValueOnce([policy])
      .mockResolvedValueOnce([]) // no matching mails
      .mockResolvedValueOnce([]) // update policy stats

    const result = await applyRetentionPolicies()
    expect(result.policiesRun).toBe(1)
    expect(result.totalDeleted).toBe(0)
  })

  it('handles policy with label filter', async () => {
    const policy = {
      id: 'p3',
      user_id: 'user-1',
      name: 'Label cleanup',
      gmail_account_id: null,
      label: 'PROMOTIONS',
      max_age_days: 14,
      is_active: true,
      deleted_count: 0,
    }
    mockExecute
      .mockResolvedValueOnce([policy])
      .mockResolvedValueOnce([{ id: 'mail-3', eml_path: '/tmp/3.eml', gmail_account_id: 'acc-1' }])
      .mockResolvedValueOnce([]) // attachments
      .mockResolvedValueOnce([]) // delete attachments
      .mockResolvedValueOnce([]) // delete mails
      .mockResolvedValueOnce([]) // update

    const result = await applyRetentionPolicies()
    expect(result.totalDeleted).toBe(1)
  })

  it('continues on policy error', async () => {
    const policies = [
      { id: 'p1', user_id: 'user-1', name: 'Fail', gmail_account_id: null, label: null, max_age_days: 1, is_active: true, deleted_count: 0 },
      { id: 'p2', user_id: 'user-1', name: 'OK', gmail_account_id: null, label: null, max_age_days: 1, is_active: true, deleted_count: 0 },
    ]
    mockExecute
      .mockResolvedValueOnce(policies) // policies
      .mockRejectedValueOnce(new Error('DB error')) // first policy fails
      .mockResolvedValueOnce([]) // second policy: no mails
      .mockResolvedValueOnce([]) // update second

    const result = await applyRetentionPolicies()
    expect(result.policiesRun).toBe(2)
    // First policy failed, second succeeded with 0 deleted
    expect(result.totalDeleted).toBe(0)
  })

  it('handles deleteFile errors gracefully', async () => {
    const policy = {
      id: 'p1',
      user_id: 'user-1',
      name: 'Test',
      gmail_account_id: null,
      label: null,
      max_age_days: 30,
      is_active: true,
      deleted_count: 0,
    }
    mockStorage.deleteFile.mockRejectedValue(new Error('file not found'))

    mockExecute
      .mockResolvedValueOnce([policy])
      .mockResolvedValueOnce([{ id: 'mail-1', eml_path: '/tmp/1.eml', gmail_account_id: 'acc-1' }])
      .mockResolvedValueOnce([{ id: 'att-1', file_path: '/tmp/att.pdf' }])
      .mockResolvedValueOnce([]) // delete attachments from DB
      .mockResolvedValueOnce([]) // delete mails from DB
      .mockResolvedValueOnce([]) // update stats

    // Should not throw even when storage.deleteFile fails
    const result = await applyRetentionPolicies()
    expect(result.totalDeleted).toBe(1)
  })
})
