import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
vi.mock('../gmail/gmail-throttle', () => ({
  gmailRetry: (fn: any) => fn(),
  limitConcurrency: async (tasks: any[], _concurrency: number) => {
    const results = []
    for (const task of tasks) results.push(await task())
    return results
  },
  withAccountLimit: async (_id: string, fn: any) => fn(),
}))

const mockAuth = {
  setCredentials: vi.fn(),
  on: vi.fn(),
  generateAuthUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/auth'),
  getToken: vi.fn(() => ({
    tokens: {
      access_token: 'mock-access',
      refresh_token: 'mock-refresh',
      expiry_date: Date.now() + 3600000,
    },
  })),
}

vi.mock('googleapis', () => {
  class MockOAuth2 {
    constructor() {
      Object.assign(this, mockAuth)
    }
  }
  return { google: {
    auth: {
      OAuth2: MockOAuth2,
    },
    oauth2: vi.fn(() => ({
      userinfo: { get: vi.fn(() => ({ data: { email: 'test@gmail.com' } })) },
    })),
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: vi.fn(() => ({
            data: { messages: [{ id: 'm1' }], nextPageToken: null, resultSizeEstimate: 1 },
          })),
          get: vi.fn(() => ({
            data: {
              id: 'm1',
              threadId: 't1',
              sizeEstimate: 1000,
              snippet: 'test',
              labelIds: ['INBOX'],
              payload: {
                headers: [
                  { name: 'Subject', value: 'Test Subject' },
                  { name: 'From', value: 'sender@test.com' },
                  { name: 'To', value: 'me@test.com' },
                  { name: 'Date', value: '2025-01-01' },
                ],
                parts: [],
              },
            },
          })),
          trash: vi.fn(() => ({ data: {} })),
          delete: vi.fn(() => ({ data: {} })),
          modify: vi.fn(() => ({ data: {} })),
        },
        labels: {
          list: vi.fn(() => ({ data: { labels: [{ id: 'INBOX', name: 'INBOX' }] } })),
          create: vi.fn(() => ({
            data: { id: 'Label_1', name: 'Custom' },
          })),
          delete: vi.fn(() => ({})),
        },
        getProfile: vi.fn(() => ({
          data: { emailAddress: 'test@gmail.com', messagesTotal: 100, threadsTotal: 80 },
        })),
      },
    })),
  } }
})

// Mock DB for oauth.service
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    constraint: () => chain,
    doUpdateSet: () => chain,
    returning: () => chain,
    updateTable: () => chain,
    set: () => chain,
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  }
  return chain
}

vi.mock('../db', () => ({
  getDb: () => ({
    selectFrom: () => chainable(),
    insertInto: () => chainable(),
    updateTable: () => chainable(),
  }),
}))

import { createOAuth2Client, getGmailAuthUrl } from '../auth/oauth.service'

beforeEach(() => vi.clearAllMocks())

describe('createOAuth2Client', () => {
  it('creates an OAuth2 client', () => {
    const client = createOAuth2Client()
    expect(client).toBeDefined()
  })
})

describe('getGmailAuthUrl', () => {
  it('generates an auth URL with state', () => {
    const url = getGmailAuthUrl('test-state')
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth')
  })
})
