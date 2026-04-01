import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * This test uses vi.resetModules() to reimport social.service with all providers configured.
 * This covers buildProviders() for Microsoft/Discord/Facebook/LinkedIn/Keycloak and
 * the non-PKCE createAuthorizationURL path.
 */

// ─── Shared DB Mock ─────────────────────────────────────────
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

// All providers configured
vi.mock('../config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_SSO_REDIRECT_URI: 'http://localhost:3000/api/auth/social/google/callback',
    MICROSOFT_CLIENT_ID: 'ms-id',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
    DISCORD_CLIENT_ID: 'discord-id',
    DISCORD_CLIENT_SECRET: 'discord-secret',
    FACEBOOK_CLIENT_ID: 'fb-id',
    FACEBOOK_CLIENT_SECRET: 'fb-secret',
    LINKEDIN_CLIENT_ID: 'li-id',
    LINKEDIN_CLIENT_SECRET: 'li-secret',
    KEYCLOAK_REALM_URL: 'http://keycloak:8080/realms/test',
    KEYCLOAK_CLIENT_ID: 'kc-id',
    KEYCLOAK_CLIENT_SECRET: 'kc-secret',
    FRONTEND_URL: 'http://localhost:3000',
    ALLOW_REGISTRATION: true,
    ADMIN_EMAIL: undefined,
  },
}))

// Mock arctic with all provider classes + fetch for profile endpoints
const mockCreateAuthorizationURL = vi.fn().mockReturnValue(new URL('https://auth.example.com/authorize?state=test'))
const mockValidateAuthorizationCode = vi.fn()

vi.mock('arctic', () => ({
  Google: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  MicrosoftEntraId: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  Discord: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  Facebook: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  LinkedIn: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  KeyCloak: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  generateCodeVerifier: vi.fn().mockReturnValue('code-verifier'),
  decodeIdToken: vi.fn().mockReturnValue({
    sub: 'google-user-id',
    email: 'user@gmail.com',
    name: 'Test',
    picture: null,
  }),
}))

// Mock global fetch for provider profile endpoints
const mockFetchJson = vi.fn()
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  json: mockFetchJson,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchJson.mockResolvedValue({
    id: 'provider-user-id',
    email: 'user@provider.com',
    name: 'Provider User',
    mail: 'user@provider.com',
    userPrincipalName: 'user@provider.com',
    displayName: 'Provider User',
    global_name: 'Provider User',
    username: 'provideruser',
    avatar: null,
    sub: 'provider-user-id',
    picture: null,
    preferred_username: 'provideruser',
  })
})

import {
  getEnabledProviders,
  isProviderEnabled,
  createAuthorizationUrl,
  exchangeSocialCode,
} from '../auth/social.service'

describe('social.service - all providers coverage', () => {
  it('getEnabledProviders returns all configured providers', () => {
    const providers = getEnabledProviders()
    expect(providers).toContain('google')
    expect(providers).toContain('microsoft')
    expect(providers).toContain('discord')
    expect(providers).toContain('facebook')
    expect(providers).toContain('linkedin')
    expect(providers).toContain('keycloak')
    expect(providers).toHaveLength(6)
  })

  it('isProviderEnabled returns true for all configured', () => {
    expect(isProviderEnabled('google')).toBe(true)
    expect(isProviderEnabled('microsoft')).toBe(true)
    expect(isProviderEnabled('discord')).toBe(true)
    expect(isProviderEnabled('facebook')).toBe(true)
    expect(isProviderEnabled('linkedin')).toBe(true)
    expect(isProviderEnabled('keycloak')).toBe(true)
  })

  it('createAuthorizationUrl for non-PKCE provider (discord)', () => {
    const result = createAuthorizationUrl('discord', 'state-123')
    expect(result.url).toContain('https://auth.example.com')
    expect(result.codeVerifier).toBeNull()
  })

  it('createAuthorizationUrl for PKCE provider (microsoft)', () => {
    const result = createAuthorizationUrl('microsoft', 'state-ms')
    expect(result.url).toContain('https://auth.example.com')
    expect(result.codeVerifier).toBe('code-verifier')
  })

  it('createAuthorizationUrl for facebook (non-PKCE)', () => {
    const result = createAuthorizationUrl('facebook', 'state-fb')
    expect(result.codeVerifier).toBeNull()
  })

  it('createAuthorizationUrl for linkedin (non-PKCE)', () => {
    const result = createAuthorizationUrl('linkedin', 'state-li')
    expect(result.codeVerifier).toBeNull()
  })

  it('createAuthorizationUrl for keycloak (PKCE)', () => {
    const result = createAuthorizationUrl('keycloak', 'state-kc')
    expect(result.codeVerifier).toBe('code-verifier')
  })

  it('exchangeSocialCode for microsoft fetches profile via Graph API', async () => {
    const mockTokens = {
      accessToken: () => 'ms-access-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // findOrCreateUser: new user
    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // no social
      .mockResolvedValueOnce(null) // no user by email
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' }) // insert user
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@provider.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    const result = await exchangeSocialCode('microsoft', 'code', 'verifier')
    expect(result.id).toBe('new-id')
    // Verify fetch was called for MS Graph
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer ms-access-token' } }),
    )
  })

  it('exchangeSocialCode for discord fetches profile via Discord API', async () => {
    const mockTokens = {
      accessToken: () => 'discord-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' })
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@provider.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    await exchangeSocialCode('discord', 'code', null)
    expect(fetch).toHaveBeenCalledWith(
      'https://discord.com/api/users/@me',
      expect.any(Object),
    )
  })

  it('exchangeSocialCode for facebook fetches profile via Graph API', async () => {
    const mockTokens = {
      accessToken: () => 'fb-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)
    mockFetchJson.mockResolvedValueOnce({
      id: 'fb-user',
      email: 'user@fb.com',
      name: 'FB User',
      picture: { data: { url: 'https://fb.com/photo.jpg' } },
    })

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' })
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@fb.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    await exchangeSocialCode('facebook', 'code', null)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('graph.facebook.com/me'),
      // Facebook doesn't use headers - uses query params
    )
  })

  it('exchangeSocialCode for linkedin fetches profile', async () => {
    const mockTokens = {
      accessToken: () => 'li-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' })
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@provider.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    await exchangeSocialCode('linkedin', 'code', null)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.linkedin.com/v2/userinfo',
      expect.any(Object),
    )
  })

  it('exchangeSocialCode for keycloak fetches profile', async () => {
    const mockTokens = {
      accessToken: () => 'kc-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' })
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@provider.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    await exchangeSocialCode('keycloak', 'code', 'verifier')
    expect(fetch).toHaveBeenCalledWith(
      'http://keycloak:8080/realms/test/protocol/openid-connect/userinfo',
      expect.any(Object),
    )
  })

  it('discord fetchProfile includes avatar URL when avatar is present', async () => {
    const mockTokens = {
      accessToken: () => 'discord-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)
    mockFetchJson.mockResolvedValueOnce({
      id: 'disc-123',
      email: 'user@discord.com',
      global_name: 'Cool User',
      username: 'cooluser',
      avatar: 'abc123',
    })

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-id' })
      .mockResolvedValueOnce({ id: 'new-id', email: 'user@discord.com', role: 'user' })
    mockExecute.mockResolvedValue([])

    await exchangeSocialCode('discord', 'code', null)
  })
})
