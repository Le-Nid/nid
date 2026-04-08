import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
const mockList = vi.fn()
const mockGet = vi.fn()
const mockTrash = vi.fn()
const mockModify = vi.fn()
const mockLabelsList = vi.fn()
const mockLabelsCreate = vi.fn()
const mockLabelsDelete = vi.fn()
const mockLabelsGet = vi.fn()
const mockGetProfile = vi.fn()
const mockAttachmentsGet = vi.fn()

// Override the global setup.ts mock to use the real module
vi.unmock('../gmail/gmail.service')

vi.mock('../auth/oauth.service', () => ({
  getAuthenticatedClient: vi.fn().mockResolvedValue({}),
}))

vi.mock('googleapis', () => ({
  google: {
    gmail: () => ({
      users: {
        messages: {
          list: (...args: any[]) => mockList(...args),
          get: (...args: any[]) => mockGet(...args),
          trash: (...args: any[]) => mockTrash(...args),
          modify: (...args: any[]) => mockModify(...args),
          attachments: {
            get: (...args: any[]) => mockAttachmentsGet(...args),
          },
        },
        labels: {
          list: (...args: any[]) => mockLabelsList(...args),
          create: (...args: any[]) => mockLabelsCreate(...args),
          delete: (...args: any[]) => mockLabelsDelete(...args),
          get: (...args: any[]) => mockLabelsGet(...args),
        },
        getProfile: (...args: any[]) => mockGetProfile(...args),
      },
    }),
  },
}))

vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: () => any) => fn(),
  limitConcurrency: async (fns: (() => Promise<any>)[], _c: number) => {
    const results = []
    for (const fn of fns) results.push(await fn())
    return results
  },
  withAccountLimit: async (_id: string, fn: () => any, _ep?: string) => fn(),
}))

const mockTrackApiCall = vi.fn().mockResolvedValue(undefined)
vi.mock('../gmail/quota.service', () => ({
  trackApiCall: (...args: any[]) => mockTrackApiCall(...args),
}))

import {
  listMessages,
  getMessage,
  getMessageFull,
  batchGetMessages,
  trashMessages,
  modifyMessages,
  listLabels,
  createLabel,
  deleteLabel,
  getMailboxProfile,
  getLabelStats,
} from '../gmail/gmail.service'

beforeEach(() => vi.clearAllMocks())

// ─── listMessages ───────────────────────────────────────
describe('listMessages', () => {
  it('returns messages and tracks API call', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [{ id: 'msg-1' }],
        nextPageToken: 'token-2',
        resultSizeEstimate: 100,
      },
    })

    const result = await listMessages('acc-1', { query: 'is:unread', maxResults: 10 })

    expect(result.messages).toEqual([{ id: 'msg-1' }])
    expect(result.nextPageToken).toBe('token-2')
    expect(result.resultSizeEstimate).toBe(100)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.list')
  })

  it('handles empty response', async () => {
    mockList.mockResolvedValue({ data: {} })

    const result = await listMessages('acc-1')

    expect(result.messages).toEqual([])
    expect(result.nextPageToken).toBeNull()
    expect(result.resultSizeEstimate).toBe(0)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.list')
  })

  it('uses default maxResults of 50', async () => {
    mockList.mockResolvedValue({ data: { messages: [] } })

    await listMessages('acc-1', {})

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 50 }),
    )
  })
})

// ─── getMessage ─────────────────────────────────────────
describe('getMessage', () => {
  it('returns formatted message metadata and tracks API call', async () => {
    mockGet.mockResolvedValue({
      data: {
        id: 'msg-1',
        threadId: 'thread-1',
        sizeEstimate: 1024,
        snippet: 'Hello',
        labelIds: ['INBOX'],
        payload: {
          headers: [
            { name: 'Subject', value: 'Test' },
            { name: 'From', value: 'sender@test.com' },
            { name: 'To', value: 'me@test.com' },
            { name: 'Date', value: '2024-01-15' },
          ],
          parts: [],
        },
      },
    })

    const result = await getMessage('acc-1', 'msg-1')

    expect(result.id).toBe('msg-1')
    expect(result.subject).toBe('Test')
    expect(result.from).toBe('sender@test.com')
    expect(result.hasAttachments).toBe(false)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })

  it('handles message with attachments', async () => {
    mockGet.mockResolvedValue({
      data: {
        id: 'msg-2',
        payload: {
          headers: [],
          parts: [{ filename: 'report.pdf' }],
        },
      },
    })

    const result = await getMessage('acc-1', 'msg-2')
    expect(result.hasAttachments).toBe(true)
  })
})

// ─── getMessageFull ─────────────────────────────────────
describe('getMessageFull', () => {
  it('returns full message data and tracks API call', async () => {
    const fullData = { id: 'msg-1', payload: { body: { data: 'abc' } } }
    mockGet.mockResolvedValue({ data: fullData })

    const result = await getMessageFull('acc-1', 'msg-1')

    expect(result).toEqual(fullData)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.get')
  })
})

// ─── batchGetMessages ───────────────────────────────────
describe('batchGetMessages', () => {
  it('returns formatted messages for each id and calls onProgress', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: {
          id: 'msg-1',
          payload: { headers: [{ name: 'Subject', value: 'S1' }] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'msg-2',
          payload: { headers: [{ name: 'Subject', value: 'S2' }] },
        },
      })

    const onProgress = vi.fn()
    const results = await batchGetMessages('acc-1', ['msg-1', 'msg-2'], { onProgress })

    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('msg-1')
    expect(results[1].id).toBe('msg-2')
    expect(onProgress).toHaveBeenCalledWith(2, 2)
  })
})

// ─── trashMessages ──────────────────────────────────────
describe('trashMessages', () => {
  it('trashes messages and tracks each call', async () => {
    mockTrash.mockResolvedValue({ data: {} })

    await trashMessages('acc-1', ['msg-1', 'msg-2'])

    expect(mockTrash).toHaveBeenCalledTimes(2)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.trash')
  })
})

// ─── modifyMessages ─────────────────────────────────────
describe('modifyMessages', () => {
  it('modifies labels and tracks each call', async () => {
    mockModify.mockResolvedValue({ data: {} })

    await modifyMessages('acc-1', ['msg-1'], ['STARRED'], ['UNREAD'])

    expect(mockModify).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD'] },
      }),
    )
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'messages.modify')
  })
})

// ─── listLabels ─────────────────────────────────────────
describe('listLabels', () => {
  it('returns labels and tracks API call', async () => {
    mockLabelsList.mockResolvedValue({
      data: { labels: [{ id: 'INBOX', name: 'INBOX' }] },
    })

    const result = await listLabels('acc-1')

    expect(result).toEqual([{ id: 'INBOX', name: 'INBOX' }])
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'labels.list')
  })

  it('returns empty array when no labels', async () => {
    mockLabelsList.mockResolvedValue({ data: {} })

    const result = await listLabels('acc-1')
    expect(result).toEqual([])
  })
})

// ─── createLabel ────────────────────────────────────────
describe('createLabel', () => {
  it('creates label and tracks API call', async () => {
    mockLabelsCreate.mockResolvedValue({
      data: { id: 'Label_1', name: 'MyLabel' },
    })

    const result = await createLabel('acc-1', 'MyLabel')

    expect(result).toEqual({ id: 'Label_1', name: 'MyLabel' })
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'labels.create')
  })
})

// ─── deleteLabel ────────────────────────────────────────
describe('deleteLabel', () => {
  it('deletes label and tracks API call', async () => {
    mockLabelsDelete.mockResolvedValue({})

    await deleteLabel('acc-1', 'Label_1')

    expect(mockLabelsDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'Label_1' }),
    )
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'labels.delete')
  })
})

// ─── getMailboxProfile ──────────────────────────────────
describe('getMailboxProfile', () => {
  it('returns profile and tracks API call', async () => {
    mockGetProfile.mockResolvedValue({
      data: { emailAddress: 'test@gmail.com', messagesTotal: 500 },
    })

    const result = await getMailboxProfile('acc-1')

    expect(result.emailAddress).toBe('test@gmail.com')
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'users.getProfile')
  })
})

// ─── getLabelStats ──────────────────────────────────────
describe('getLabelStats', () => {
  it('returns label stats and tracks API call', async () => {
    mockLabelsGet.mockResolvedValue({
      data: { id: 'INBOX', messagesTotal: 100, messagesUnread: 5 },
    })

    const result = await getLabelStats('acc-1', 'INBOX')

    expect(result.messagesTotal).toBe(100)
    expect(mockTrackApiCall).toHaveBeenCalledWith('acc-1', 'labels.get')
  })
})

// ─── trackApiCall error resilience ──────────────────────
describe('trackApiCall error resilience', () => {
  it('does not throw when trackApiCall rejects', async () => {
    mockTrackApiCall.mockRejectedValue(new Error('DB down'))
    mockList.mockResolvedValue({ data: { messages: [] } })

    // Should not throw despite trackApiCall failing
    const result = await listMessages('acc-1')
    expect(result.messages).toEqual([])
  })

  it('does not throw when trackApiCall rejects on getMessage', async () => {
    mockTrackApiCall.mockRejectedValue(new Error('DB down'))
    mockGet.mockResolvedValue({
      data: { id: 'msg-1', payload: { headers: [] } },
    })

    const result = await getMessage('acc-1', 'msg-1')
    expect(result.id).toBe('msg-1')
  })
})
