// IMAP accounts: sealed credentials, incremental folder sync, account routes
import Fastify from 'fastify'

// ─── DB stand-in: records writes, serves the folder state ───
const folderState = new Map<string, { uid_validity: string; last_uid: string }>()
const writes: { op: string; table: string; values?: any }[] = []
const resets: string[] = []
const mockTakeFirst = vi.fn()
const mockTakeFirstOrThrow = vi.fn()
const chainFor = (op: string, table: string): any => {
  const wheres: unknown[][] = []
  const chain: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      if (prop === 'executeTakeFirst') {
        return async () => (table === 'imap_folder_state' && op === 'selectFrom'
          ? folderState.get(String(wheres.find((w) => w[0] === 'folder')?.[2]))
          : mockTakeFirst())
      }
      if (prop === 'executeTakeFirstOrThrow') return mockTakeFirstOrThrow
      if (prop === 'execute') {
        return async () => {
          if (op === 'deleteFrom') resets.push(table)
          // The mark is written by INSERT … SELECT (sql.val): its values are the conflict update's, for the folder in use
          if (table === 'imap_folder_state' && op === 'insertInto') {
            folderState.set(server.current, { uid_validity: String(upsert.uid_validity), last_uid: String(upsert.last_uid) })
          }
          return []
        }
      }
      return (...args: any[]) => {
        if (prop === 'where') wheres.push(args)
        if (prop === 'values' || prop === 'set') writes.push({ op, table, values: args[0] })
        for (const a of args) if (typeof a === 'function') a(eb)
        return chain
      }
    },
  })
  return chain
}
// Expression builder stand-in: every property and call gives itself back (eb.fn.countAll(), oc.constraint().doNothing()…)
let upsert: any = {}
const eb: any = new Proxy(function () {}, {
  get: (_t, p) => {
    if (p === 'then') return undefined
    if (p === 'doUpdateSet') return (v: unknown) => { upsert = v; return eb }
    return eb
  },
  apply: () => eb,
})
const mockDb = new Proxy({}, { get: (_t, op: string) => (table: string) => chainFor(op, table) })
vi.mock('../db', () => ({ getDb: () => mockDb }))
vi.mock('../storage/storage.service', () => ({ getLocalStorage: () => ({}) }))
vi.mock('../audit/audit.service', () => ({ logAudit: vi.fn() }))

const importSingleEml = vi.hoisted(() => vi.fn())
vi.mock('../archive/import.service', () => ({ importSingleEml }))
const discoverImap = vi.hoisted(() => vi.fn())
vi.mock('../imap/autoconfig', () => ({ discoverImap }))

// ─── imapflow stand-in: folders of { uid, source } ───
const server = vi.hoisted(() => ({
  folders: [] as { path: string; name?: string; flags: Set<string>; specialUse?: string; uidValidity: number; messages: { uid: number; date?: Date }[] }[],
  current: '' as string,
  loginFails: false,
  fetched: [] as string[],
}))
vi.mock('imapflow', () => ({
  ImapFlow: class {
    mailbox: any = null
    async connect() { if (server.loginFails) throw Object.assign(new Error('auth'), { authenticationFailed: true, responseText: 'Invalid credentials' }) }
    async logout() {}
    async list() { return server.folders }
    async getMailboxLock(path: string) {
      const f = server.folders.find((x) => x.path === path)!
      server.current = path
      this.mailbox = { uidValidity: BigInt(f.uidValidity), uidNext: Math.max(0, ...f.messages.map((m) => m.uid)) + 1 }
      return { release: () => {} }
    }
    async *fetch(range: string | { uid: string; since: Date }) {
      const uids = typeof range === 'string' ? range : range.uid
      server.fetched.push(`${server.current} ${typeof range === 'string' ? range : `${uids} since ${range.since.toISOString().slice(0, 10)}`}`)
      const from = Number(uids.split(':')[0])
      const f = server.folders.find((x) => x.path === server.current)!
      // a SEARCH range: only what the server dates on or after `since`
      const newer = f.messages.filter((m) => m.uid >= from && (typeof range === 'string' || !m.date || m.date >= range.since))
      // `n:*` returns the newest message even when none is >= n (RFC 3501)
      for (const m of newer.length ? newer : f.messages.slice(-1)) yield { uid: m.uid, source: Buffer.from(`mail ${m.uid}`) }
    }
  },
}))

import { sealSecret, openSecret } from '../utils/secret'
import { foldersToSync, syncImapAccount } from '../imap/imap.service'
import { imapAccountRoutes } from '../routes/imap-accounts'

const SEALED = sealSecret('app-password')
const box = (path: string, uids: number[], extra: Partial<(typeof server.folders)[number]> = {}) =>
  ({ path, flags: new Set<string>(), uidValidity: 7, messages: uids.map((uid) => ({ uid })), ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  folderState.clear()
  writes.length = 0
  resets.length = 0
  server.fetched.length = 0
  server.loginFails = false
  mockTakeFirst.mockResolvedValue({ provider: 'imap', imap_host: 'imap.test', imap_port: 993, imap_secure: true, imap_user: 'ana', imap_password: SEALED })
  importSingleEml.mockResolvedValue('imported')
})

describe('sealed secrets', () => {
  it('round-trips, never stores the plain text, and refuses a tampered value', () => {
    const sealed = sealSecret('hunter2')
    expect(sealed).toMatch(/^v1:/)
    expect(sealed).not.toContain('hunter2')
    expect(openSecret(sealed)).toBe('hunter2')
    expect(sealSecret('hunter2')).not.toBe(sealed) // random IV
    const parts = sealed.split(':')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => openSecret(parts.join(':'))).toThrow()
    expect(() => openSecret('plain')).toThrow('Unknown sealed secret format')
  })
})

describe('syncImapAccount', () => {
  it('skips \\\\Noselect, junk, trash and All Mail', () => {
    const list: any[] = [box('INBOX', []), box('[Gmail]', [], { flags: new Set(['\\Noselect']) }), box('Spam', [], { specialUse: '\\Junk' }),
      box('Trash', [], { specialUse: '\\Trash' }), box('All', [], { specialUse: '\\All' }), box('Sent', [], { specialUse: '\\Sent' })]
    expect(foldersToSync(list).map((f) => f.path)).toEqual(['INBOX', 'Sent'])
  })

  it('archives each folder once, then only the new UIDs; the folder becomes a label', async () => {
    server.folders = [box('INBOX', [1, 2]), box('Factures', [5])]
    expect(await syncImapAccount('acc-1')).toEqual({ imported: 3, skipped: 0, errors: 0, folders: 2 })
    // (the db stand-in answers every property, so it is left out of the comparison)
    expect(importSingleEml.mock.calls.map((c) => [c[2], String(c[3]), c[4]])).toEqual([
      ['acc-1', 'mail 1', ['INBOX']], ['acc-1', 'mail 2', ['INBOX']], ['acc-1', 'mail 5', ['Factures']],
    ])
    expect(folderState.get('INBOX')).toEqual({ uid_validity: '7', last_uid: '2' })

    importSingleEml.mockClear()
    server.folders[0].messages.push({ uid: 3 })
    expect(await syncImapAccount('acc-1')).toMatchObject({ imported: 1 })
    expect(server.fetched.at(-1)).toBe('INBOX 3:*')
    expect(server.fetched.filter((f) => f.startsWith('Factures'))).toHaveLength(1) // nothing new: not fetched again
  })

  it('a changed UIDVALIDITY restarts the folder; a failure stops its mark so the mail is retried', async () => {
    server.folders = [box('INBOX', [1, 2, 3])]
    importSingleEml.mockResolvedValueOnce('imported').mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce('imported')
    expect(await syncImapAccount('acc-1')).toMatchObject({ imported: 2, errors: 1 })
    expect(folderState.get('INBOX')?.last_uid).toBe('1')

    server.folders = [box('INBOX', [1, 2, 3], { uidValidity: 8 })]
    importSingleEml.mockResolvedValue('skipped')
    await syncImapAccount('acc-1')
    expect(server.fetched.at(-1)).toBe('INBOX 1:*')
    expect(folderState.get('INBOX')).toEqual({ uid_validity: '8', last_uid: '3' })
  })

  it('chosen folders (junk included if chosen) and a start date', async () => {
    const list: any[] = [box('INBOX', []), box('Spam', [], { specialUse: '\\Junk' }), box('Sent', []), box('[Gmail]', [], { flags: new Set(['\\Noselect']) })]
    expect(foldersToSync(list, ['Spam', 'Sent', '[Gmail]', 'Gone']).map((f) => f.path)).toEqual(['Spam', 'Sent'])

    server.folders = [box('INBOX', [1, 2, 3]), box('Sent', [9])]
    server.folders[0].messages[0].date = new Date('2023-12-31')
    // the connection settings, then what the backup covers
    mockTakeFirst.mockReset()
      .mockResolvedValueOnce({ provider: 'imap', imap_host: 'imap.test', imap_port: 993, imap_secure: true, imap_user: 'ana', imap_password: SEALED })
      .mockResolvedValueOnce({ imap_folders: ['INBOX'], since: '2024-01-01' })
    expect(await syncImapAccount('acc-1')).toMatchObject({ imported: 2, folders: 1 })
    expect(server.fetched).toEqual(['INBOX 1:* since 2024-01-01'])
    expect(folderState.get('INBOX')?.last_uid).toBe('3')
  })

  it('refuses an account that is not IMAP', async () => {
    mockTakeFirst.mockResolvedValueOnce({ provider: 'gmail' })
    await expect(syncImapAccount('acc-1')).rejects.toThrow('Not an IMAP account')
  })
})

describe('IMAP account routes', () => {
  async function build() {
    const app = Fastify()
    app.decorate('authenticate', async (req: any) => { req.user = { sub: 'u1', email: 'a@b.c', role: 'user' } })
    app.decorate('requireAccountOwnership', async () => {})
    app.setErrorHandler((err: any, _req, reply) => { reply.code(err.name === 'ZodError' ? 400 : 500).send({ error: err.message }) })
    await app.register(imapAccountRoutes)
    return app
  }
  const BODY = { email: 'Ana@Mail.FR', host: 'imap.mail.fr', user: 'ana', password: 'app-password' }

  it('checks the login, then stores the account with its password sealed', async () => {
    mockTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 3 }).mockResolvedValueOnce({ id: 'acc-9', email: 'ana@mail.fr' })
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '1' })
    const res = await (await build()).inject({ method: 'POST', url: '/', payload: BODY })
    expect(res.statusCode).toBe(201)
    const stored = writes.find((w) => w.table === 'mail_accounts')!.values
    expect(stored).toMatchObject({ user_id: 'u1', email: 'ana@mail.fr', provider: 'imap', imap_host: 'imap.mail.fr', imap_port: 993, imap_secure: true })
    expect(stored.imap_password).not.toBe('app-password')
    expect(openSecret(stored.imap_password)).toBe('app-password')
  })

  it('says why the server refused the login, and stores nothing', async () => {
    server.loginFails = true
    mockTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 3 })
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '0' })
    const res = await (await build()).inject({ method: 'POST', url: '/', payload: BODY })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('Invalid credentials')
    expect(writes.some((w) => w.table === 'mail_accounts')).toBe(false)
  })

  it('quota, duplicate address and bad input', async () => {
    const app = await build()
    mockTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 1 })
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '1' })
    expect((await app.inject({ method: 'POST', url: '/', payload: BODY })).statusCode).toBe(403)

    mockTakeFirst.mockResolvedValueOnce({ max_gmail_accounts: 3 }).mockResolvedValueOnce(undefined)
    mockTakeFirstOrThrow.mockResolvedValueOnce({ count: '0' })
    expect((await app.inject({ method: 'POST', url: '/', payload: BODY })).statusCode).toBe(409)

    expect((await app.inject({ method: 'POST', url: '/', payload: { ...BODY, port: 70000 } })).statusCode).toBe(400)
  })

  it('PUT replaces the credentials after a successful login and clears « Action requise »', async () => {
    mockTakeFirst.mockResolvedValueOnce({ id: 'acc-1' })
    const res = await (await build()).inject({ method: 'PUT', url: '/acc-1', payload: { host: 'imap.mail.fr', user: 'ana', password: 'new' } })
    expect(res.statusCode).toBe(200)
    expect(writes.find((w) => w.op === 'updateTable')!.values).toMatchObject({ auth_error_at: null, is_active: true })
  })

  it('GET /autoconfig prefills from the address; a bad address is refused', async () => {
    discoverImap.mockResolvedValueOnce({ host: 'imap.gmx.net', port: 993, secure: true, source: 'ispdb' })
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/autoconfig?email=Ana@GMX.fr' })
    expect(res.json()).toEqual({ host: 'imap.gmx.net', port: 993, secure: true, source: 'ispdb' })
    expect(discoverImap).toHaveBeenCalledWith('ana@gmx.fr')
    expect((await app.inject({ method: 'GET', url: '/autoconfig?email=nope' })).statusCode).toBe(400)
  })

  it('GET /:id/folders lists the server folders with what the backup covers; a refused login is a 502', async () => {
    server.folders = [box('INBOX', [], { name: 'INBOX' }), box('Spam', [], { name: 'Spam', specialUse: '\\Junk' }), box('[Gmail]', [], { flags: new Set(['\\Noselect']) })]
    mockTakeFirst.mockReset()
      .mockResolvedValueOnce({ imap_folders: ['INBOX'], since: '2024-01-01' })
      .mockResolvedValue({ provider: 'imap', imap_host: 'imap.test', imap_port: 993, imap_secure: true, imap_user: 'ana', imap_password: SEALED })
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/acc-1/folders' })
    expect(res.json()).toEqual({
      folders: [
        { path: 'INBOX', name: 'INBOX', specialUse: null, syncedByDefault: true },
        { path: 'Spam', name: 'Spam', specialUse: '\\Junk', syncedByDefault: false },
      ],
      chosen: ['INBOX'], since: '2024-01-01',
    })
    server.loginFails = true
    mockTakeFirst.mockResolvedValueOnce({ imap_folders: null, since: null })
    const refused = await app.inject({ method: 'GET', url: '/acc-1/folders' })
    expect([refused.statusCode, refused.json().error]).toEqual([502, 'Invalid credentials'])
    mockTakeFirst.mockResolvedValueOnce(undefined)
    expect((await app.inject({ method: 'GET', url: '/acc-1/folders' })).statusCode).toBe(404)
  })

  it('PUT /:id/scope stores folders and start date; a new date restarts the folders', async () => {
    const app = await build()
    mockTakeFirst.mockResolvedValueOnce({ since: null })
    const res = await app.inject({ method: 'PUT', url: '/acc-1/scope', payload: { folders: ['INBOX', 'Factures'], since: '2024-01-01' } })
    expect(res.json()).toEqual({ folders: ['INBOX', 'Factures'], since: '2024-01-01' })
    expect(writes.find((w) => w.op === 'updateTable')!.values).toMatchObject({ imap_folders: ['INBOX', 'Factures'], imap_since: '2024-01-01' })
    expect(resets).toEqual(['imap_folder_state']) // null → a date
    resets.length = 0

    // Same date, other folders: the marks stay
    mockTakeFirst.mockResolvedValueOnce({ since: '2024-01-01' })
    await app.inject({ method: 'PUT', url: '/acc-1/scope', payload: { folders: null, since: '2024-01-01' } })
    expect(resets).toHaveLength(0)
    mockTakeFirst.mockResolvedValueOnce({ since: '2024-01-01' })
    await app.inject({ method: 'PUT', url: '/acc-1/scope', payload: { folders: null, since: null } })
    expect(resets).toEqual(['imap_folder_state'])

    for (const payload of [{ folders: [], since: null }, { folders: null, since: '2024-13-01' }, { folders: null }]) {
      expect((await app.inject({ method: 'PUT', url: '/acc-1/scope', payload })).statusCode).toBe(400)
    }
    mockTakeFirst.mockResolvedValueOnce(undefined)
    expect((await app.inject({ method: 'PUT', url: '/acc-1/scope', payload: { folders: null, since: null } })).statusCode).toBe(404)
  })
})
