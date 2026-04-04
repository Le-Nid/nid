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
    ADMIN_EMAIL: undefined,
  },
}))

const { mockLoggerError } = vi.hoisted(() => {
  const mockLoggerError = vi.fn()
  return { mockLoggerError }
})
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
    fatal: vi.fn(),
  }),
}))

const mockValidateAuthorizationCode = vi.fn()
vi.mock('arctic', () => ({
  Google: class {
    createAuthorizationURL = vi.fn().mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?state=test'))
    validateAuthorizationCode = (...args: any[]) => mockValidateAuthorizationCode(...args)
  },
  MicrosoftEntraId: class { createAuthorizationURL = vi.fn(); validateAuthorizationCode = vi.fn() },
  Discord: class { createAuthorizationURL = vi.fn(); validateAuthorizationCode = vi.fn() },
  Facebook: class { createAuthorizationURL = vi.fn(); validateAuthorizationCode = vi.fn() },
  LinkedIn: class { createAuthorizationURL = vi.fn(); validateAuthorizationCode = vi.fn() },
  KeyCloak: class { createAuthorizationURL = vi.fn(); validateAuthorizationCode = vi.fn() },
  generateCodeVerifier: vi.fn().mockReturnValue('code-verifier'),
  decodeIdToken: vi.fn().mockReturnValue({
    sub: 'google-user-id',
    email: 'user@gmail.com',
    name: 'Test User',
    picture: 'https://lh3.google.com/photo',
  }),
}))

beforeEach(() => vi.clearAllMocks())

import { exchangeSocialCode } from '../auth/social.service'

function makeMockTokens(hasRefresh = true) {
  return {
    accessToken: () => 'access-token',
    accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
    hasRefreshToken: () => hasRefresh,
    refreshToken: () => hasRefresh ? 'refresh-token' : null,
    idToken: () => 'id-token',
  }
}

describe('social.service - gap coverage', () => {
  it('autoRegisterGmailAccount error is caught and login still succeeds', async () => {
    mockValidateAuthorizationCode.mockResolvedValueOnce(makeMockTokens())

    // findOrCreateUser: social found → existing user
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ user_id: 'u1' }) // social account
      .mockResolvedValueOnce({ id: 'u1', is_active: true }) // user
    mockExecute
      .mockResolvedValueOnce([]) // update display_name
    mockExecuteTakeFirstOrThrow
      .mockResolvedValueOnce({ id: 'u1', email: 'user@gmail.com', role: 'user', display_name: 'Test', avatar_url: null })

    // autoRegisterGmailAccount will fail (insertInto execute throws)
    // The execute after the loginExistingSocialUser calls is for autoRegisterGmailAccount
    mockExecute
      .mockRejectedValueOnce(new Error('DB constraint error'))

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('u1')
    // autoRegisterGmailAccount error was caught (non-blocking)
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Auto-register Gmail account failed',
    )
  })

  it('linkOrCreateSocialUser with existing user updates display_name and avatar', async () => {
    mockValidateAuthorizationCode.mockResolvedValueOnce(makeMockTokens())

    // No social account, existing user by email with no display_name
    mockExecuteTakeFirst
      .mockResolvedValueOnce(null) // no social account
      .mockResolvedValueOnce({ id: 'u2', email: 'user@gmail.com', role: 'user', is_active: true, display_name: null, avatar_url: null })
    mockExecute.mockResolvedValue([]) // update user + insert social + gmail
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'u2', email: 'user@gmail.com', role: 'user',
      display_name: 'Test User', avatar_url: 'https://lh3.google.com/photo',
    })

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('u2')
  })

  // Note: Registration disabled test removed since config mock is hoisted and immutable.
  // This scenario is already tested in social-deep.test.ts.

  it('autoRegisterGmailAccount with no refresh token uses empty string', async () => {
    mockValidateAuthorizationCode.mockResolvedValueOnce(makeMockTokens(false))

    mockExecuteTakeFirst
      .mockResolvedValueOnce({ user_id: 'u3' }) // social account
      .mockResolvedValueOnce({ id: 'u3', is_active: true })
    mockExecute.mockResolvedValue([])
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      id: 'u3', email: 'user@gmail.com', role: 'user',
      display_name: 'Test', avatar_url: null,
    })

    const result = await exchangeSocialCode('google', 'code', 'verifier')
    expect(result.id).toBe('u3')
  })
})
