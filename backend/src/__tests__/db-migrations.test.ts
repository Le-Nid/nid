import { describe, it, expect, vi } from 'vitest'

vi.unmock('../db')
vi.mock('pg', () => ({ default: { Pool: class {} } }))

const migrator = vi.hoisted(() => ({ provider: null as any, results: [] as any[], error: undefined as unknown }))
vi.mock('kysely/migration', () => ({
  Migrator: class {
    constructor(opts: { provider: unknown }) { migrator.provider = opts.provider }
    migrateToLatest = async () => ({ results: migrator.results, error: migrator.error })
  },
}))

const { runMigrations } = await import('../db')

describe('runMigrations', () => {
  it('hands Kysely every in-code migration, 013 last', async () => {
    migrator.results = [{ status: 'Success', migrationName: '013_api_tokens' }]
    await runMigrations()
    const names = Object.keys(await migrator.provider.getMigrations())
    expect(names).toEqual([...names].sort())
    expect(names.at(-1)).toBe('013_api_tokens')
  })

  it('throws the migrator error', async () => {
    migrator.results = [{ status: 'Error', migrationName: '013_api_tokens' }]
    migrator.error = new Error('boom')
    await expect(runMigrations()).rejects.toThrow('boom')
  })
})
