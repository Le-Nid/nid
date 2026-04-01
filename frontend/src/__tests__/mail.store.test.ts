import { describe, it, expect, beforeEach } from 'vitest'
import { useMailCache, cacheKey } from '../store/mail.store'

describe('cacheKey', () => {
  it('builds a composite key', () => {
    expect(cacheKey('acc-1', 'from:foo', 'unread')).toBe('acc-1:from:foo:unread')
  })

  it('handles empty segments', () => {
    expect(cacheKey('acc-1', '', '')).toBe('acc-1::')
  })
})

describe('useMailCache', () => {
  beforeEach(() => {
    useMailCache.getState().clearCache()
  })

  it('getEntry returns null for missing key', () => {
    expect(useMailCache.getState().getEntry('unknown')).toBeNull()
  })

  it('setEntry stores and getEntry retrieves', () => {
    const entry = { mails: [{ id: 'm1', threadId: 't1', subject: 'Sub', from: 'a@b.c', date: '2026-01-01', sizeEstimate: 100, snippet: '', labelIds: [], hasAttachments: false }], total: 1, pageToken: null, hasMore: false }
    useMailCache.getState().setEntry('key1', entry)
    const result = useMailCache.getState().getEntry('key1')
    expect(result).not.toBeNull()
    expect(result!.mails).toHaveLength(1)
    expect(result!.total).toBe(1)
    expect(result!.hasMore).toBe(false)
  })

  it('getEntry returns null for expired entries', () => {
    const entry = { mails: [], total: 0, pageToken: null, hasMore: false }
    useMailCache.getState().setEntry('key2', entry)

    // Manually expire the entry by overriding timestamp
    useMailCache.setState((state) => ({
      cache: {
        ...state.cache,
        key2: { ...state.cache.key2, timestamp: Date.now() - 6 * 60 * 1000 },
      },
    }))

    expect(useMailCache.getState().getEntry('key2')).toBeNull()
  })

  it('clearCache empties the store', () => {
    useMailCache.getState().setEntry('k1', { mails: [], total: 0, pageToken: null, hasMore: false })
    useMailCache.getState().setEntry('k2', { mails: [], total: 0, pageToken: null, hasMore: false })
    useMailCache.getState().clearCache()
    expect(useMailCache.getState().getEntry('k1')).toBeNull()
    expect(useMailCache.getState().getEntry('k2')).toBeNull()
  })
})
