import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
const mockList = vi.fn()
const mockGet = vi.fn()

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      messages: {
        list: (...args: any[]) => mockList(...args),
        get: (...args: any[]) => mockGet(...args),
      },
    },
  }),
}))

vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: () => any) => fn(),
  limitConcurrency: async (fns: (() => Promise<any>)[], _c: number) => {
    const results = []
    for (const fn of fns) results.push(await fn())
    return results
  },
}))

vi.mock('../gmail/quota.service', () => ({
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}))

import {
  scanNewsletters, getNewsletterMessageIds, saveNewsletterScan, getNewsletterScan, forgetNewsletterSender,
} from '../unsubscribe/unsubscribe.service'
import { getDb } from '../db'
import { trackApiCall } from '../gmail/quota.service'

beforeEach(() => vi.clearAllMocks())

describe('scanNewsletters', () => {
  it('returns empty array when no messages', async () => {
    mockList.mockResolvedValue({ data: { messages: [], nextPageToken: null } })
    const result = await scanNewsletters('acc-1')
    expect(result).toEqual([])
  })

  it('scans messages and aggregates newsletter senders', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }],
        resultSizeEstimate: 3,
        nextPageToken: null,
      },
    })

    // msg-1 and msg-2 from same sender, msg-3 from different sender
    mockGet
      .mockResolvedValueOnce({
        data: {
          id: 'msg-1',
          sizeEstimate: 5000,
          payload: {
            headers: [
              { name: 'From', value: 'Newsletter <news@example.com>' },
              { name: 'Date', value: '2024-01-15T10:00:00Z' },
              { name: 'List-Unsubscribe', value: '<https://unsub.example.com/1>' },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'msg-2',
          sizeEstimate: 3000,
          payload: {
            headers: [
              { name: 'From', value: 'Newsletter <news@example.com>' },
              { name: 'Date', value: '2024-01-20T10:00:00Z' },
              { name: 'List-Unsubscribe', value: '<mailto:unsub@example.com>' },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'msg-3',
          sizeEstimate: 2000,
          payload: {
            headers: [
              { name: 'From', value: 'Other <other@test.com>' },
              { name: 'Date', value: '2024-01-10T10:00:00Z' },
              { name: 'List-Unsubscribe', value: '<https://test.com/unsub>, <mailto:stop@test.com>' },
            ],
          },
        },
      })

    const result = await scanNewsletters('acc-1')

    expect(result).toHaveLength(2)
    // Sorted by count descending
    expect(result[0].email).toBe('news@example.com')
    expect(result[0].count).toBe(2)
    expect(result[0].totalSizeBytes).toBe(8000)
    expect(result[0].unsubscribeUrl).toBe('https://unsub.example.com/1')
    expect(result[0].unsubscribeMailto).toBe('mailto:unsub@example.com')
    expect(result[0].latestDate).toBe('2024-01-20T10:00:00Z')

    expect(result[1].email).toBe('other@test.com')
    expect(result[1].count).toBe(1)
    expect(result[1].unsubscribeUrl).toBe('https://test.com/unsub')
    expect(result[1].unsubscribeMailto).toBe('mailto:stop@test.com')

    // Verify tracking calls
    expect(trackApiCall).toHaveBeenCalledWith('acc-1', 'messages.list')
    expect(trackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('keeps list senders without List-Unsubscribe (D3) and counts unread mails', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: null,
      },
    })
    const plain = (id: string, labelIds: string[]) => ({
      data: { id, labelIds, payload: { headers: [{ name: 'From', value: 'plain@test.com' }] } },
    })
    mockGet.mockResolvedValueOnce(plain('msg-1', ['UNREAD', 'INBOX'])).mockResolvedValueOnce(plain('msg-2', ['INBOX']))

    const [sender] = await scanNewsletters('acc-1')
    expect(sender).toMatchObject({ email: 'plain@test.com', count: 2, unreadCount: 1, unsubscribeUrl: null, unsubscribeMailto: null })
  })

  it('calls onProgress callback', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }],
        resultSizeEstimate: 1,
        nextPageToken: null,
      },
    })
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: {
          headers: [
            { name: 'From', value: 'n@test.com' },
            { name: 'List-Unsubscribe', value: '<https://x.com>' },
          ],
        },
      },
    })

    const onProgress = vi.fn()
    await scanNewsletters('acc-1', onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('handles pagination', async () => {
    mockList
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg-1' }],
          resultSizeEstimate: 2,
          nextPageToken: 'tok2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg-2' }],
          resultSizeEstimate: 2,
          nextPageToken: null,
        },
      })

    mockGet
      .mockResolvedValueOnce({
        data: {
          id: 'msg-1',
          sizeEstimate: 1000,
          payload: {
            headers: [
              { name: 'From', value: 'a@a.com' },
              { name: 'List-Unsubscribe', value: '<https://a.com/unsub>' },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'msg-2',
          sizeEstimate: 2000,
          payload: {
            headers: [
              { name: 'From', value: 'b@b.com' },
              { name: 'List-Unsubscribe', value: '<https://b.com/unsub>' },
            ],
          },
        },
      })

    const result = await scanNewsletters('acc-1')
    expect(result).toHaveLength(2)
  })
})

describe('getNewsletterMessageIds', () => {
  it('returns message IDs for a sender', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: null,
      },
    })

    const ids = await getNewsletterMessageIds('acc-1', 'news@example.com')
    expect(ids).toEqual(['msg-1', 'msg-2'])
  })

  it('handles pagination', async () => {
    mockList
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg-1' }],
          nextPageToken: 'tok2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'msg-2' }],
          nextPageToken: null,
        },
      })

    const ids = await getNewsletterMessageIds('acc-1', 'sender@test.com')
    expect(ids).toEqual(['msg-1', 'msg-2'])
  })

  it('returns empty array when no messages', async () => {
    mockList.mockResolvedValue({
      data: { messages: null, nextPageToken: null },
    })

    const ids = await getNewsletterMessageIds('acc-1', 'nobody@test.com')
    expect(ids).toEqual([])
  })
})

// ─── Cached scan (L6) ───────────────────────────────────────
function chain(result?: unknown) {
  const c: any = {}
  for (const m of ['insertInto', 'values', 'onConflict', 'column', 'doUpdateSet', 'selectFrom', 'select', 'where', 'updateTable', 'set']) {
    c[m] = vi.fn((arg?: any) => {
      if (m === 'onConflict') arg(c)
      return c
    })
  }
  c.execute = vi.fn().mockResolvedValue(undefined)
  c.executeTakeFirst = vi.fn().mockResolvedValue(result)
  vi.mocked(getDb).mockReturnValue(c)
  return c
}

describe('newsletter scan cache', () => {
  const sender = { sender: 'N <n@x.com>', email: 'n@x.com', count: 3, totalSizeBytes: 10, unreadCount: 2, unsubscribeUrl: null, unsubscribeMailto: null, latestDate: '', sampleMessageIds: [] }

  it('persists the scan, one row per account (upsert)', async () => {
    const db = chain()
    await saveNewsletterScan('acc-1', [sender])
    expect(db.insertInto).toHaveBeenCalledWith('newsletter_scans')
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc-1', senders: JSON.stringify([sender]) }))
    expect(db.column).toHaveBeenCalledWith('account_id')
    expect(db.doUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ senders: JSON.stringify([sender]) }))
  })

  it('reads the cached senders and scan date', async () => {
    const scannedAt = new Date('2026-10-20T08:00:00Z')
    chain({ senders: [sender], scanned_at: scannedAt })
    expect(await getNewsletterScan('acc-1')).toEqual({ senders: [sender], scannedAt })
  })

  it('reports a never-scanned account', async () => {
    chain(undefined)
    expect(await getNewsletterScan('acc-1')).toEqual({ senders: [], scannedAt: null })
  })

  it('drops one sender from the cache without rescanning', async () => {
    const db = chain()
    await forgetNewsletterSender('acc-1', 'N@X.com')
    expect(db.updateTable).toHaveBeenCalledWith('newsletter_scans')
    expect(db.where).toHaveBeenCalledWith('account_id', '=', 'acc-1')
    const { senders } = db.set.mock.calls[0][0]
    // Filtered in SQL (atomic), lowercased like the scan's keys
    expect(JSON.stringify(senders.toOperationNode())).toContain('"n@x.com"')
    expect(mockList).not.toHaveBeenCalled()
  })
})
