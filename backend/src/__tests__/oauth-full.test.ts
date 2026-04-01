import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
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

const mockGetToken = vi.fn()
const mockUserinfoGet = vi.fn()

vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials = vi.fn()
    on = vi.fn()
    generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?mock')
    getToken = (...args: any[]) => mockGetToken(...args)
  }
  return {
    google: {
      auth: { OAuth2: MockOAuth2 },
      gmail: () => ({}),
      oauth2: () => ({ userinfo: { get: (...args: any[]) => mockUserinfoGet(...args) } }),
    },
  }
})

import { createOAuth2Client, getGmailAuthUrl, exchangeGmailCode, getAuthenticatedClient } from '../auth/oauth.service'

beforeEach(() => vi.clearAllMocks())

describe('createOAuth2Client', () => {
  it('creates an OAuth2 client instance', () => {
    const client = createOAuth2Client()
    expect(client).toBeDefined()
    expect(client.setCredentials).toBeDefined()
  })
})

describe('getGmailAuthUrl', () => {
  it('generates auth URL with state', () => {
    const url = getGmailAuthUrl('my-state')
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth?mock')
  })
})

describe('exchangeGmailCode', () => {
  it('exchanges code, fetches userinfo and upserts account', async () => {
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'at',
        refresh_token: 'rt',
        expiry_date: Date.now() + 3600000,
      },
    })
    mockUserinfoGet.mockResolvedValue({ data: { email: 'test@gmail.com' } })
    mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'acc-1', email: 'test@gmail.com' })

    const result = await exchangeGmailCode('auth-code', 'user-1')
    expect(result).toEqual({ id: 'acc-1', email: 'test@gmail.com' })
    expect(mockGetToken).toHaveBeenCalledWith('auth-code')
    expect(mockUserinfoGet).toHaveBeenCalled()
  })
})

describe('getAuthenticatedClient', () => {
  it('throws when account not found', async () => {
    mockExecuteTakeFirst.mockResolvedValue(null)
    await expect(getAuthenticatedClient('nonexistent')).rejects.toThrow('Gmail account not found')
  })

  it('returns client with credentials set', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      token_expiry: new Date(Date.now() + 3600000),
    })

    const client = await getAuthenticatedClient('acc-1')
    expect(client).toBeDefined()
    expect(client.setCredentials).toHaveBeenCalled()
    expect(client.on).toHaveBeenCalledWith('tokens', expect.any(Function))
  })
})
