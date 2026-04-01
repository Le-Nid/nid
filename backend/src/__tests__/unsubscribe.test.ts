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

import { scanNewsletters, getNewsletterMessageIds } from '../unsubscribe/unsubscribe.service'

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
  })

  it('skips messages without List-Unsubscribe header', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }],
        nextPageToken: null,
      },
    })
    mockGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: {
          headers: [
            { name: 'From', value: 'plain@test.com' },
          ],
        },
      },
    })

    const result = await scanNewsletters('acc-1')
    expect(result).toEqual([])
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
