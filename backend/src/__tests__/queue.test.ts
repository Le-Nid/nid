vi.unmock('../jobs/queue')

const { mockAdd, mockValues } = vi.hoisted(() => ({ mockAdd: vi.fn(), mockValues: vi.fn() }))

vi.mock('bullmq', () => ({
  Queue: class { add = mockAdd },
  Worker: class {},
  Job: class {},
}))
vi.mock('../plugins/redis', () => ({ getRedis: vi.fn() }))
vi.mock('../db', () => {
  const chain: any = {
    values: (v: unknown) => { mockValues(v); return chain },
    onConflict: () => chain,
    execute: vi.fn(),
  }
  return { getDb: () => ({ insertInto: () => chain }) }
})

import { enqueueJob } from '../jobs/queue'

beforeEach(() => {
  vi.clearAllMocks()
  mockAdd.mockImplementation(async (_name: string, _data: unknown, opts: { jobId: string }) => ({ id: opts.jobId }))
})

describe('enqueueJob', () => {
  it('gives two jobs enqueued in the same millisecond different ids', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const a = await enqueueJob('archive_mails', { accountId: 'acc-1' })
    const b = await enqueueJob('archive_mails', { accountId: 'acc-2' })
    expect(a.id).not.toBe(b.id)
    expect(mockValues).toHaveBeenCalledTimes(2)
  })

  it('stores jobs without an account as NULL, not an invalid uuid', async () => {
    await enqueueJob('integrity_check', { accountId: '' })
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ gmail_account_id: null }))
  })

  it('does not insert a second job row when BullMQ deduplicates', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'run_rule-already-queued' })
    await enqueueJob('run_rule', { accountId: 'acc-1', ruleId: 'r1' }, { dedupId: 'run_rule-r1' })
    expect(mockAdd).toHaveBeenCalledWith('run_rule', expect.anything(), expect.objectContaining({ deduplication: { id: 'run_rule-r1' } }))
    expect(mockValues).not.toHaveBeenCalled()
  })

  it('never stores credentials in the jobs table, and drops them from Redis once done', async () => {
    await enqueueJob('import_imap', { accountId: 'acc-1', imapConfig: { host: 'h', user: 'u', pass: 'secret' } })
    await enqueueJob('encrypt_archives', { accountId: 'acc-1', passphrase: 'hunter22' })
    const stored = mockValues.mock.calls.map(([v]: any) => v.payload).join(' ')
    expect(stored).not.toContain('secret')
    expect(stored).not.toContain('hunter22')
    expect(stored).toContain('"host":"h"')
    expect(mockAdd).toHaveBeenCalledWith('import_imap', expect.anything(), expect.objectContaining({ removeOnComplete: true, removeOnFail: true }))
  })
})
