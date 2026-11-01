import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

// A Kysely that compiles real SQL and answers each query with `rows`
const seen: CompiledQuery[] = []
let rows: unknown[] = []
const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => { seen.push(q); return { rows } },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => db }))
vi.mock('../plugins/redis', () => ({ getRedis: () => ({ get: async () => null, set: async () => 'OK' }) }))
vi.mock('../gmail/gmail.service', () => ({ listMessages: vi.fn(), batchGetMessages: vi.fn() }))

import { getHeatmap, getInboxZeroData } from '../analytics/analytics.service'

describe('getHeatmap', () => {
  it('counts the archive per weekday × hour in the given time zone, trash excluded', async () => {
    rows = [{ day: 0, hour: 9, count: '12' }, { day: 6, hour: 23, count: '1' }]
    expect(await getHeatmap('acc-1', 'Europe/Paris')).toEqual([{ day: 0, hour: 9, count: 12 }, { day: 6, hour: 23, count: 1 }])
    const q = seen.at(-1)!
    expect(q.sql).toContain('isodow FROM date AT TIME ZONE $1')
    expect(q.sql).toContain('deleted_at IS NULL')
    expect(q.parameters).toEqual(['Europe/Paris', 'Europe/Paris', 'acc-1'])
  })
})

describe('getInboxZeroData', () => {
  it('reads days as YYYY-MM-DD text (pg turns a DATE into a JS Date, which broke the streak sort)', async () => {
    rows = [{ inbox_count: 0, unread_count: 0, date: '2026-10-31' }]
    const res = await getInboxZeroData('acc-1')
    expect(seen.at(-1)!.sql).toContain(`to_char(recorded_at, 'YYYY-MM-DD')`)
    expect(res.history).toEqual([{ date: '2026-10-31', inboxCount: 0, unreadCount: 0 }])
    expect(res.streak).toBe(1)
  })
})
