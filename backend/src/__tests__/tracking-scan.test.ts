import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable: any = () => {
  const chain: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'execute') return mockExecute
      if (prop === 'executeTakeFirst') return mockExecuteTakeFirst
      if (prop === 'executeTakeFirstOrThrow') return mockExecuteTakeFirstOrThrow
      return (..._args: any[]) => chain
    },
  })
  return chain
}

const mockDb = new Proxy({}, { get: () => () => chainable() })
vi.mock('../db', () => ({ getDb: () => mockDb }))

const mockGmailList = vi.fn()
const mockGmailGet = vi.fn()

vi.mock('../gmail/gmail.service', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      messages: {
        list: (...args: any[]) => mockGmailList(...args),
        get: (...args: any[]) => mockGmailGet(...args),
      },
    },
  }),
}))

vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: () => any) => fn(),
}))

vi.mock('../gmail/quota.service', () => ({
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}))

import { scanTrackingPixels, getTrackingStats, listTrackedMessages } from '../privacy/tracking.service'
import { trackApiCall } from '../gmail/quota.service'

beforeEach(() => vi.clearAllMocks())

describe('scanTrackingPixels', () => {
  it('scans messages and detects tracking pixels', async () => {
    // Already scanned IDs
    mockExecute.mockResolvedValueOnce([])

    // List messages
    mockGmailList.mockResolvedValueOnce({
      data: {
        messages: [{ id: 'msg-1' }],
      },
    })

    // Get full message with tracking pixel
    mockGmailGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: {
          mimeType: 'text/html',
          body: {
            data: Buffer.from(
              '<html><body><img src="https://track.mailchimp.com/pixel.gif" width="1" height="1"></body></html>'
            ).toString('base64url'),
          },
          headers: [
            { name: 'Subject', value: 'Newsletter' },
            { name: 'From', value: 'sender@test.com' },
            { name: 'Date', value: '2024-01-15T10:00:00Z' },
          ],
        },
      },
    })

    // DB insert for tracking pixel
    mockExecute.mockResolvedValue([])

    const result = await scanTrackingPixels('acc-1', { maxMessages: 10 })
    expect(result.scanned).toBe(1)
    expect(result.tracked).toBe(1)
    expect(trackApiCall).toHaveBeenCalledWith('acc-1', 'messages.list')
    expect(trackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('skips already scanned messages', async () => {
    mockExecute.mockResolvedValueOnce([{ gmail_message_id: 'msg-1' }])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    })

    const result = await scanTrackingPixels('acc-1')
    expect(result.scanned).toBe(0)
    expect(mockGmailGet).not.toHaveBeenCalled()
  })

  it('handles messages without HTML body', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    })
    mockGmailGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: {
          mimeType: 'text/plain',
          body: { data: Buffer.from('plain text').toString('base64url') },
          headers: [],
        },
      },
    })

    const result = await scanTrackingPixels('acc-1')
    expect(result.scanned).toBe(1)
    expect(result.tracked).toBe(0)
  })

  it('calls onProgress callback', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    })
    mockGmailGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: { mimeType: 'text/plain', body: {}, headers: [] },
      },
    })

    const onProgress = vi.fn()
    await scanTrackingPixels('acc-1', { onProgress })
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('handles fetch errors gracefully', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    })
    mockGmailGet.mockRejectedValueOnce(new Error('API error'))

    const result = await scanTrackingPixels('acc-1')
    expect(result.scanned).toBe(1)
    expect(result.tracked).toBe(0)
  })

  it('handles empty message list', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: null },
    })

    const result = await scanTrackingPixels('acc-1')
    expect(result.scanned).toBe(0)
  })

  it('detects multipart HTML body', async () => {
    mockExecute.mockResolvedValueOnce([])
    mockGmailList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    })
    mockGmailGet.mockResolvedValueOnce({
      data: {
        id: 'msg-1',
        payload: {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: Buffer.from('text').toString('base64url') } },
            {
              mimeType: 'text/html',
              body: {
                data: Buffer.from('<html><img src="https://track.mailchimp.com/open.gif" width="1" height="1"></html>').toString('base64url'),
              },
            },
          ],
          headers: [
            { name: 'Subject', value: 'Test' },
            { name: 'From', value: 'test@test.com' },
          ],
        },
      },
    })
    mockExecute.mockResolvedValue([])

    const result = await scanTrackingPixels('acc-1')
    expect(result.tracked).toBe(1)
  })
})

describe('getTrackingStats', () => {
  it('returns tracking statistics', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 5 })
    mockExecute
      .mockResolvedValueOnce([]) // byDomain
      .mockResolvedValueOnce([   // rows with trackers
        { trackers: [{ type: 'pixel', domain: 'track.com' }], tracker_count: 1 },
        { trackers: [{ type: 'pixel', domain: 'track.com' }, { type: 'utm', domain: 'ads.com' }], tracker_count: 2 },
      ])

    const stats = await getTrackingStats('acc-1')
    expect(stats.trackedMessages).toBe(5)
    expect(stats.totalTrackers).toBe(3)
    expect(stats.topDomains).toContainEqual({ domain: 'track.com', count: 2 })
    expect(stats.topDomains).toContainEqual({ domain: 'ads.com', count: 1 })
  })
})

describe('listTrackedMessages', () => {
  it('returns paginated tracked messages', async () => {
    const rows = [
      { id: '1', gmail_message_id: 'msg-1', subject: 'Test', sender: 'a@b.com', date: new Date(), trackers: [], tracker_count: 1, scanned_at: new Date() },
    ]
    mockExecute.mockResolvedValueOnce(rows)
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({ count: 1 })

    const result = await listTrackedMessages('acc-1', { limit: 10, offset: 0 })
    expect(result.items).toEqual(rows)
    expect(result.total).toBe(1)
  })
})
