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

vi.mock('../config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_SSO_REDIRECT_URI: 'http://localhost:3000/api/auth/social/google/callback',
    MICROSOFT_CLIENT_ID: undefined,
    MICROSOFT_CLIENT_SECRET: undefined,
    DISCORD_CLIENT_ID: undefined,
    DISCORD_CLIENT_SECRET: undefined,
    FACEBOOK_CLIENT_ID: undefined,
    FACEBOOK_CLIENT_SECRET: undefined,
    LINKEDIN_CLIENT_ID: undefined,
    LINKEDIN_CLIENT_SECRET: undefined,
    KEYCLOAK_REALM_URL: undefined,
    KEYCLOAK_CLIENT_ID: undefined,
    KEYCLOAK_CLIENT_SECRET: undefined,
    FRONTEND_URL: 'http://localhost:3000',
    ALLOW_REGISTRATION: true,
    ADMIN_EMAIL: 'admin@test.com',
  },
}))

// Mock arctic
const mockCreateAuthorizationURL = vi.fn().mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?state=test'))
const mockValidateAuthorizationCode = vi.fn()
vi.mock('arctic', () => ({
  Google: class {
    createAuthorizationURL = mockCreateAuthorizationURL
    validateAuthorizationCode = mockValidateAuthorizationCode
  },
  MicrosoftEntraId: class {
    createAuthorizationURL = vi.fn()
    validateAuthorizationCode = vi.fn()
  },
  Discord: class {
    createAuthorizationURL = vi.fn()
    validateAuthorizationCode = vi.fn()
  },
  Facebook: class {
    createAuthorizationURL = vi.fn()
    validateAuthorizationCode = vi.fn()
  },
  LinkedIn: class {
    createAuthorizationURL = vi.fn()
    validateAuthorizationCode = vi.fn()
  },
  KeyCloak: class {
    createAuthorizationURL = vi.fn()
    validateAuthorizationCode = vi.fn()
  },
  generateCodeVerifier: vi.fn().mockReturnValue('code-verifier'),
  decodeIdToken: vi.fn().mockReturnValue({
    sub: 'google-user-id',
    email: 'user@gmail.com',
    name: 'Test User',
    picture: 'https://lh3.google.com/photo',
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the module-level provider cache
})

import {
  getEnabledProviders,
  isProviderEnabled,
  createAuthorizationUrl,
  exchangeSocialCode,
} from '../auth/social.service'

describe('getEnabledProviders', () => {
  it('returns enabled providers based on config', () => {
    const providers = getEnabledProviders()
    expect(providers).toContain('google')
  })
})

describe('isProviderEnabled', () => {
  it('returns true for enabled provider', () => {
    expect(isProviderEnabled('google')).toBe(true)
  })

  it('returns false for disabled provider', () => {
    expect(isProviderEnabled('discord')).toBe(false)
  })
})

describe('createAuthorizationUrl', () => {
  it('creates authorization URL for google (with PKCE)', () => {
    const result = createAuthorizationUrl('google', 'state-123')
    expect(result.url).toContain('https://accounts.google.com')
    expect(result.codeVerifier).toBe('code-verifier')
  })

  it('throws for unconfigured provider', () => {
    expect(() => createAuthorizationUrl('discord' as any, 'state')).toThrow('Provider discord is not configured')
  })
})

describe('exchangeSocialCode', () => {
  it('exchanges code and creates user for google provider', async () => {
    const mockTokens = {
      accessToken: () => 'access-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
      hasRefreshToken: () => true,
      refreshToken: () => 'refresh-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // findOrCreateUser flow: no social account found, no existing user → create new
    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // social account lookup
      .mockResolvedValueOnce(null) // existing user by email
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'new-user-id' }) // insert user
      .mockResolvedValueOnce({ id: 'new-user-id', email: 'user@gmail.com', role: 'user', display_name: 'Test User', avatar_url: null }) // return user
    mockExecute.mockResolvedValue([]) // link social + gmail

    const result = await exchangeSocialCode('google', 'auth-code', 'code-verifier')
    expect(result.id).toBe('new-user-id')
  })

  it('logs in existing social user', async () => {
    const mockTokens = {
      accessToken: () => 'access-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
      hasRefreshToken: () => false,
      refreshToken: () => null,
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // Social account found
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ user_id: 'existing-user' }) // social account
      .mockResolvedValueOnce({ id: 'existing-user', is_active: true }) // user active check
    mockExecute.mockResolvedValue([]) // update display_name etc
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'existing-user', email: 'user@gmail.com', role: 'user',
      display_name: 'Test', avatar_url: null,
    })

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('existing-user')
  })

  it('throws when account is disabled (social login)', async () => {
    const mockTokens = {
      accessToken: () => 'token',
      accessTokenExpiresAt: () => new Date(),
      hasRefreshToken: () => false,
      refreshToken: () => null,
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // social account found, but user is disabled
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ user_id: 'disabled-user' })
      .mockResolvedValueOnce({ id: 'disabled-user', is_active: false })

    await expect(exchangeSocialCode('google', 'code', 'verifier')).rejects.toThrow('Account is disabled')
  })

  it('links social account to existing user with same email', async () => {
    const mockTokens = {
      accessToken: () => 'access-token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
      hasRefreshToken: () => true,
      refreshToken: () => 'refresh-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // No social account, but existing user by email
    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // no social account
      .mockResolvedValueOnce({ id: 'existing-user', email: 'user@gmail.com', role: 'user', is_active: true, display_name: null, avatar_url: null }) // existing user
    mockExecute.mockResolvedValue([]) // insert social + update user + gmail
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'existing-user', email: 'user@gmail.com', role: 'user',
      display_name: 'Test User', avatar_url: 'https://lh3.google.com/photo',
    })

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('existing-user')
  })

  it('throws for unconfigured provider', async () => {
    await expect(exchangeSocialCode('discord' as any, 'code', null)).rejects.toThrow('not configured')
  })

  it('throws when disabled user found by email', async () => {
    const mockTokens = {
      accessToken: () => 'token',
      accessTokenExpiresAt: () => new Date(),
      hasRefreshToken: () => false,
      refreshToken: () => null,
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    // no social account, but existing disabled user
    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // no social
      .mockResolvedValueOnce({ id: 'disabled-user', email: 'user@gmail.com', is_active: false }) // disabled user

    await expect(exchangeSocialCode('google', 'code', 'verifier')).rejects.toThrow('Account is disabled')
  })

  it('assigns admin role when email matches ADMIN_EMAIL', async () => {
    const { decodeIdToken } = await import('arctic')
    ;(decodeIdToken as any).mockReturnValueOnce({
      sub: 'admin-google-id',
      email: 'admin@test.com',
      name: 'Admin',
      picture: null,
    })

    const mockTokens = {
      accessToken: () => 'token',
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
      hasRefreshToken: () => true,
      refreshToken: () => 'refresh-token',
      idToken: () => 'id-token',
    }
    mockValidateAuthorizationCode.mockResolvedValueOnce(mockTokens)

    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // no social account
      .mockResolvedValueOnce(null) // no existing user
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'admin-id' }) // insert user
      .mockResolvedValueOnce({ id: 'admin-id', email: 'admin@test.com', role: 'admin' }) // return user
    mockExecute.mockResolvedValue([])

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('admin-id')
  })
})
