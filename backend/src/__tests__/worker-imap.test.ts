// An IMAP account's backup goes through the IMAP sync, and a refused login flags the account
const mockTakeFirst = vi.fn()
const writes: { table: string; values: any }[] = []
const chainFor = (table: string): any => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      if (prop === 'executeTakeFirst') return mockTakeFirst
      if (prop === 'execute') return vi.fn().mockResolvedValue([])
      return (...args: any[]) => { if (prop === 'set') writes.push({ table, values: args[0] }); return chain }
    },
  })
  return chain
}
vi.mock('../db', () => ({ getDb: () => new Proxy({}, { get: () => (table: string) => chainFor(table) }) }))
const mockNotify = vi.fn()
vi.mock('../notifications/notify', () => ({ notify: (...a: any[]) => mockNotify(...a) }))
const sync = vi.hoisted(() => vi.fn())
const flag = vi.hoisted(() => vi.fn())
vi.mock('../imap/imap.service', () => ({
  syncImapAccount: sync,
  isImapAuthError: (err: any) => !!err?.authenticationFailed,
}))
vi.mock('../auth/oauth.service', () => ({ flagReauthRequired: flag }))
const listMessages = vi.hoisted(() => vi.fn())
vi.mock('../gmail/gmail.service', () => ({ listMessages, trashMessages: vi.fn(), modifyMessages: vi.fn() }))
vi.mock('../events/events.service', () => ({ publishUserEvents: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../jobs/queue', () => ({ enqueueJob: vi.fn() }))
vi.mock('../plugins/redis', () => ({ getRedis: () => ({}) }))
vi.mock('bullmq', () => ({ Worker: class { processor: any; constructor(_n: string, p: any) { this.processor = p } on() { return this } } }))

import { startUnifiedWorker } from '../jobs/workers/unified.worker'

const job = (extra: object = {}) => ({
  id: 'j1', name: 'archive_mails', data: { accountId: 'acc-1', userId: 'u1', differential: true },
  opts: { attempts: 1 }, attemptsMade: 0, updateProgress: vi.fn(), ...extra,
})
const processJob = (j: any) => (startUnifiedWorker() as any).processor(j)

beforeEach(() => {
  vi.clearAllMocks()
  writes.length = 0
  mockTakeFirst.mockResolvedValue({ provider: 'imap' })
})

it('archive_mails on an IMAP account syncs it (no Gmail call) and reports the counts', async () => {
  sync.mockImplementation(async (_id: string, onProgress: (n: number) => Promise<void>) => {
    await onProgress(20)
    return { imported: 20, skipped: 2, errors: 0, folders: 3 }
  })
  await processJob(job())
  expect(sync).toHaveBeenCalledWith('acc-1', expect.any(Function))
  expect(listMessages).not.toHaveBeenCalled()
  expect(writes.at(-1)!.values).toMatchObject({ status: 'completed', processed: 22, total: 22 })
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_completed', title: 'Sauvegarde IMAP terminée' }))
})

it('a login the IMAP server refuses flags the account « à reconnecter », then the job fails', async () => {
  sync.mockRejectedValue(Object.assign(new Error('auth'), { authenticationFailed: true }))
  await expect(processJob(job())).rejects.toThrow('auth')
  expect(flag).toHaveBeenCalledWith('acc-1', 'Le serveur IMAP')
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ category: 'job_failed' }))

  flag.mockClear()
  sync.mockRejectedValue(new Error('ETIMEDOUT'))
  await expect(processJob(job())).rejects.toThrow('ETIMEDOUT')
  expect(flag).not.toHaveBeenCalled()
})
