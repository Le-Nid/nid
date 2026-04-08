import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([])
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

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?test')
        setCredentials = vi.fn()
        getToken = vi.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600000 } })
        on = vi.fn()
      },
    },
    oauth2: () => ({ userinfo: { get: vi.fn().mockResolvedValue({ data: { email: 'test@gmail.com' } }) } }),
  },
}))

vi.mock('../config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback',
  },
}))

import { getGmailAuthUrl, exchangeGmailCode, getAuthenticatedClient, createOAuth2Client } from '../auth/oauth.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('oauth.service - coverage gaps', () => {
  it('createOAuth2Client returns an OAuth2 instance', () => {
    const client = createOAuth2Client()
    expect(client).toBeDefined()
    expect(client.generateAuthUrl).toBeDefined()
  })

  it('getGmailAuthUrl returns a URL string', () => {
    const url = getGmailAuthUrl('state-123')
    expect(url).toContain('https://accounts.google.com')
  })

  it('exchangeGmailCode exchanges code and saves account', async () => {
    await exchangeGmailCode('auth-code', 'user-1')
    expect(mockExecuteTakeFirstOrThrow).toHaveBeenCalled()
  })

  it('getAuthenticatedClient registers tokens handler that updates db', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      token_expiry: new Date().toISOString(),
    })

    const client = await getAuthenticatedClient('acc-1')

    // The client.on was called with 'tokens'
    expect(client.on).toHaveBeenCalledWith('tokens', expect.any(Function))

    // Retrieve the handler from the mock call
    const tokensCall = (client.on as any).mock.calls.find((c: any[]) => c[0] === 'tokens')
    expect(tokensCall).toBeDefined()
    const tokensHandler = tokensCall[1]

    await tokensHandler({
      access_token: 'new-at',
      expiry_date: Date.now() + 7200000,
    })

    // Should have called updateTable to persist new token
    expect(mockExecute).toHaveBeenCalled()
  })

  it('getAuthenticatedClient tokens handler ignores when no access_token', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      token_expiry: new Date().toISOString(),
    })

    const client = await getAuthenticatedClient('acc-1')

    const tokensCall = (client.on as any).mock.calls.find((c: any[]) => c[0] === 'tokens')
    const tokensHandler = tokensCall[1]

    // Trigger with no access_token
    mockExecute.mockClear()
    await tokensHandler({ refresh_token: 'new-rt' })

    // Should NOT have updated the DB (no updateTable execute call for token update)
    // The handler only runs when tokens.access_token is truthy
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('getAuthenticatedClient throws when account not found', async () => {
    mockExecuteTakeFirst.mockResolvedValueOnce(null)
    await expect(getAuthenticatedClient('missing')).rejects.toThrow('Gmail account not found')
  })
})
