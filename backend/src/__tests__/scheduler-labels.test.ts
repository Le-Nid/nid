const chain: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'execute') return async () => []
    if (prop === 'then') return undefined
    return () => chain
  },
})
vi.mock('../db', () => ({ getDb: () => chain }))
vi.mock('../analytics/analytics.service', () => ({ recordInboxSnapshot: vi.fn() }))
vi.mock('../expiration/expiration.service', () => ({ processExpiredEmails: vi.fn().mockResolvedValue({ processed: 0, errors: 0 }) }))
vi.mock('../archive/sharing.service', () => ({ cleanupExpiredShares: vi.fn().mockResolvedValue(0) }))
const mockSyncAllLabels = vi.fn().mockResolvedValue(undefined)
vi.mock('../labels/labels.service', () => ({ syncAllLabels: () => mockSyncAllLabels() }))

import { startRuleScheduler } from '../jobs/scheduler'

describe('scheduler — daily Gmail label sync', () => {
  afterEach(() => vi.useRealTimers())

  it('syncs labels on the first tick, then not again within 24 h', async () => {
    vi.useFakeTimers()
    startRuleScheduler()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockSyncAllLabels).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockSyncAllLabels).toHaveBeenCalledTimes(1)
  })
})
