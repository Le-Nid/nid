import { describe, it, expect, vi } from 'vitest'

const executed = vi.hoisted(() => [] as string[])
vi.mock('kysely', async () => ({
  ...(await vi.importActual<object>('kysely')),
  sql: (strings: TemplateStringsArray) => ({ execute: async () => { executed.push(strings.join('')) } }),
}))

const { up, down } = await import('../db/migrations/009_drop_pii_tracking')

describe('migration 009 (O7: PII and tracking scans removed)', () => {
  it('up drops both tables, if they exist', async () => {
    const dropped: string[] = []
    const db: any = {
      schema: { dropTable: (name: string) => ({ ifExists: () => ({ execute: async () => { dropped.push(name) } }) }) },
    }
    await up(db)
    expect(dropped).toEqual(['pii_findings', 'tracking_pixels'])
  })

  it('down recreates both tables and their indexes', async () => {
    await down({} as any)
    const ddl = executed.join('')
    for (const stmt of ['CREATE TABLE tracking_pixels', 'CREATE TABLE pii_findings', 'idx_tracking_pixels_account', 'idx_pii_findings_mail']) {
      expect(ddl).toContain(stmt)
    }
  })
})
