import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger to capture error calls
const { mockLoggerError } = vi.hoisted(() => {
  const mockLoggerError = vi.fn()
  return { mockLoggerError }
})
vi.mock('../logger', () => {
  const mockLogger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => mockLogger),
  }
  return { logger: mockLogger, createLogger: vi.fn(() => mockLogger) }
})

// Mock DB
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()

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
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
  }),
}))

import { logAudit } from '../audit/audit.service'

beforeEach(() => vi.clearAllMocks())

describe('logAudit', () => {
  it('inserts audit log entry with defaults', async () => {
    mockExecute.mockResolvedValue([])
    await logAudit('user-1', 'user.login')
    expect(mockExecute).toHaveBeenCalled()
  })

  it('inserts audit log with all options', async () => {
    mockExecute.mockResolvedValue([])
    await logAudit('user-1', 'rule.create', {
      targetType: 'rule',
      targetId: 'r-123',
      details: { name: 'My Rule' },
      ipAddress: '192.168.1.1',
    })
    expect(mockExecute).toHaveBeenCalled()
  })

  it('does not throw on DB error', async () => {
    mockExecute.mockRejectedValue(new Error('DB connection error'))
    await logAudit('user-1', 'user.login')
    expect(mockLoggerError).toHaveBeenCalled()
  })

  it('handles all audit action types', async () => {
    mockExecute.mockResolvedValue([])
    const actions = [
      'user.login', 'user.register', 'user.login_sso', 'user.login_social',
      'gmail.connect', 'gmail.disconnect',
      'rule.create', 'rule.update', 'rule.delete', 'rule.run', 'rule.create_from_template',
      'bulk.trash', 'bulk.delete', 'bulk.label', 'bulk.archive',
      'archive.trigger', 'archive.export_zip',
      'duplicates.delete', 'newsletter.delete',
      'admin.update_user', 'user.2fa_enable', 'user.2fa_disable',
    ] as const
    for (const action of actions) {
      await logAudit('user-1', action)
    }
    expect(mockExecute).toHaveBeenCalledTimes(actions.length)
  })
})
