import { describe, it, expect, vi } from 'vitest'

// Test the migration up/down functions
const mockExecute = vi.fn().mockResolvedValue(undefined)
const mockDropTable = vi.fn()

const addColumnChain: any = {
  addColumn: vi.fn().mockReturnThis(),
  execute: mockExecute,
}
const dropColumnChain: any = {
  dropColumn: vi.fn().mockReturnThis(),
  execute: mockExecute,
}

const createTableChain: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'execute') return mockExecute
    return () => createTableChain
  },
})

const dropTableChain: any = {
  ifExists: vi.fn().mockReturnValue({ execute: mockExecute }),
  execute: mockExecute,
}

const insertChain: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'execute') return mockExecute
    return () => insertChain
  },
})

const mockDb: any = {
  schema: {
    alterTable: vi.fn().mockReturnValue({
      addColumn: vi.fn().mockReturnValue(addColumnChain),
      dropColumn: vi.fn().mockReturnValue(dropColumnChain),
    }),
    createTable: vi.fn().mockReturnValue(createTableChain),
    dropTable: vi.fn().mockReturnValue(dropTableChain),
  },
  insertInto: vi.fn().mockReturnValue(insertChain),
}

// We need to mock kysely's sql tagged template
vi.mock('kysely', async () => {
  const actual = await vi.importActual('kysely')
  return {
    ...actual as any,
    sql: new Proxy(() => ({ execute: vi.fn().mockResolvedValue(undefined) }), {
      get: (_target, prop) => {
        if (prop === 'execute') return vi.fn().mockResolvedValue(undefined)
        return (..._args: any[]) => ({ execute: vi.fn().mockResolvedValue(undefined) })
      },
      apply: () => ({ execute: vi.fn().mockResolvedValue(undefined) }),
    }),
  }
})

import { up, down } from '../db/migrations/003_archive_trash'

describe('migration 003_archive_trash', () => {
  it('up() adds deleted_at column, creates system_config table, and seeds config', async () => {
    await up(mockDb)

    // Verify alterTable for adding deleted_at
    expect(mockDb.schema.alterTable).toHaveBeenCalledWith('archived_mails')
    // Verify system_config table creation
    expect(mockDb.schema.createTable).toHaveBeenCalledWith('system_config')
    // Verify seeding config rows
    expect(mockDb.insertInto).toHaveBeenCalledWith('system_config')
  })

  it('down() drops system_config, removes index and column', async () => {
    await down(mockDb)

    expect(mockDb.schema.dropTable).toHaveBeenCalledWith('system_config')
    expect(mockDb.schema.alterTable).toHaveBeenCalledWith('archived_mails')
  })
})
