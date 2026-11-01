// A folder's mark is written only while the account's start date is still the one the sync used
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery } from 'kysely'

const seen: CompiledQuery[] = []
const fakeDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => {
          seen.push(q)
          if (q.sql.includes('"imap_password"')) return { rows: [{ provider: 'imap', imap_host: 'h', imap_port: 993, imap_secure: true, imap_user: 'u', imap_password: 'p' }] }
          if (q.sql.includes('imap_since::text')) return { rows: [{ imap_folders: null, since: '2024-01-01' }] }
          return { rows: [] }
        },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => fakeDb }))
vi.mock('../utils/secret', () => ({ openSecret: (v: string) => v }))
vi.mock('../storage/storage.service', () => ({ getLocalStorage: () => ({}) }))
vi.mock('../archive/import.service', () => ({ importSingleEml: vi.fn(async () => 'imported') }))
vi.mock('imapflow', () => ({
  ImapFlow: class {
    mailbox = { uidValidity: 7n, uidNext: 3 }
    async connect() {}
    async logout() {}
    async list() { return [{ path: 'INBOX', flags: new Set() }] }
    async getMailboxLock() { return { release() {} } }
    async *fetch() { yield { uid: 2, source: Buffer.from('m') } }
  },
}))

import { syncImapAccount } from '../imap/imap.service'

it('INSERT … SELECT guarded by the start date the sync used', async () => {
  await syncImapAccount('acc-1')
  const mark = seen.find((q) => q.sql.startsWith('insert into "imap_folder_state"'))!
  expect(mark.sql).toBe(
    'insert into "imap_folder_state" ("account_id", "folder", "uid_validity", "last_uid") '
    + 'select $1 as "account_id", $2 as "folder", $3 as "uid_validity", $4 as "last_uid" from "mail_accounts" '
    + 'where "id" = $5 and imap_since IS NOT DISTINCT FROM $6::date '
    + 'on conflict ("account_id", "folder") do update set "uid_validity" = $7, "last_uid" = $8',
  )
  expect(mark.parameters).toEqual(['acc-1', 'INBOX', 7, 2, 'acc-1', '2024-01-01', 7, 2])
})
