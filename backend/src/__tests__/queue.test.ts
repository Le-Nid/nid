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
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ account_id: null }))
  })

  it('does not insert a second job row when BullMQ deduplicates', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'run_rule-already-queued' })
    await enqueueJob('run_rule', { accountId: 'acc-1', ruleId: 'r1' }, { dedupId: 'run_rule-r1' })
    expect(mockAdd).toHaveBeenCalledWith('run_rule', expect.anything(), expect.objectContaining({ deduplication: { id: 'run_rule-r1' } }))
    expect(mockValues).not.toHaveBeenCalled()
  })

  it('never stores credentials in the jobs table, and drops them from Redis once done', async () => {
    await enqueueJob('import_imap', { accountId: 'acc-1', imapConfig: { host: 'h', user: 'u', pass: 'secret' } })
    await enqueueJob('decrypt_archives', { accountId: 'acc-1', passphrase: 'hunter22' })
    const stored = mockValues.mock.calls.map(([v]: any) => v.payload).join(' ')
    expect(stored).not.toContain('secret')
    expect(stored).not.toContain('hunter22')
    expect(stored).toContain('"host":"h"')
    expect(mockAdd).toHaveBeenCalledWith('import_imap', expect.anything(), expect.objectContaining({ removeOnComplete: true, removeOnFail: true }))
  })

  it('delays the BullMQ job and stores the row as scheduled', async () => {
    await enqueueJob('bulk_operation', { accountId: 'acc-1' }, { delay: 10_000 })
    expect(mockAdd).toHaveBeenCalledWith('bulk_operation', expect.anything(), expect.objectContaining({ delay: 10_000 }))
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }))
  })

  it('keeps immediate jobs pending without a BullMQ delay', async () => {
    await enqueueJob('bulk_operation', { accountId: 'acc-1' }, { delay: 0 })
    expect(mockAdd.mock.calls[0][2]).not.toHaveProperty('delay')
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
  })
})
