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

vi.mock('../db', () => ({ getDb: () => new Proxy({}, { get: () => () => chainable() }) }))

vi.mock('arctic', () => {
  class MockGoogle {
    createAuthorizationURL(_state: string, _cv: string, _scopes: string[]) {
      return new URL('https://accounts.google.com/auth')
    }
    async validateAuthorizationCode(_code: string, _cv: string) {
      return {
        accessToken: () => 'mock-access-token',
        accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
        hasRefreshToken: () => true,
        refreshToken: () => 'mock-refresh-token',
        idToken: () => 'mock-id-token',
      }
    }
  }
  class MockDiscord {
    createAuthorizationURL(_state: string, _x: null, _scopes: string[]) {
      return new URL('https://discord.com/oauth2/authorize')
    }
    async validateAuthorizationCode(_code: string) {
      return {
        accessToken: () => 'mock-discord-token',
        accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
        hasRefreshToken: () => false,
      }
    }
  }
  return {
    Google: MockGoogle,
    MicrosoftEntraId: vi.fn(),
    Discord: MockDiscord,
    Facebook: vi.fn(),
    LinkedIn: vi.fn(),
    KeyCloak: vi.fn(),
    generateCodeVerifier: () => 'cv-123',
    decodeIdToken: () => ({ sub: 'gid-1', email: 'user@gmail.com', name: 'Test', picture: 'https://pic.jpg' }),
  }
})

// We need to reset the lazy providers. Use dynamic import.
let socialService: typeof import('../auth/social.service')

beforeEach(async () => {
  vi.clearAllMocks()
  // Re-import to reset _providers
  vi.resetModules()
  // Re-apply mocks
  vi.doMock('../db', () => ({ getDb: () => new Proxy({}, { get: () => () => chainable() }) }))
  vi.doMock('arctic', () => {
    class MockGoogle {
      createAuthorizationURL() { return new URL('https://accounts.google.com/auth') }
      async validateAuthorizationCode() {
        return {
          accessToken: () => 'mock-access-token',
          accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
          hasRefreshToken: () => true,
          refreshToken: () => 'mock-refresh-token',
          idToken: () => 'mock-id-token',
        }
      }
    }
    return {
      Google: MockGoogle,
      MicrosoftEntraId: vi.fn(),
      Discord: vi.fn(),
      Facebook: vi.fn(),
      LinkedIn: vi.fn(),
      KeyCloak: vi.fn(),
      generateCodeVerifier: () => 'cv-123',
      decodeIdToken: () => ({ sub: 'gid-1', email: 'user@gmail.com', name: 'Test', picture: 'https://pic.jpg' }),
    }
  })
  socialService = await import('../auth/social.service')
})

describe('social.service', () => {
  describe('getEnabledProviders', () => {
    it('includes google when configured', () => {
      const providers = socialService.getEnabledProviders()
      expect(providers).toContain('google')
    })
  })

  describe('isProviderEnabled', () => {
    it('returns true for google', () => {
      expect(socialService.isProviderEnabled('google')).toBe(true)
    })

    it('returns false for unknown provider', () => {
      expect(socialService.isProviderEnabled('fakeprovider')).toBe(false)
    })
  })

  describe('createAuthorizationUrl', () => {
    it('creates auth URL for google with PKCE verifier', () => {
      const result = socialService.createAuthorizationUrl('google', 'state-123')
      expect(result.url).toContain('accounts.google.com')
      expect(result.codeVerifier).toBe('cv-123')
    })

    it('throws for unconfigured provider', () => {
      expect(() => socialService.createAuthorizationUrl('fakeprovider' as any, 'state'))
        .toThrow()
    })
  })

  describe('exchangeSocialCode', () => {
    it('exchanges code and finds/creates user', async () => {
      // Mock: no existing social account, no existing user by email, allow registration
      mockExecuteTakeFirst.mockResolvedValue(null) // socialAccount lookup
      mockExecuteTakeFirstOrThrow
        .mockResolvedValueOnce({ id: 'new-user-id' }) // user insert
        .mockResolvedValueOnce({ id: 'new-user-id', email: 'user@gmail.com', role: 'user', display_name: 'Test', avatar_url: null }) // final select
      mockExecute.mockResolvedValue([]) // social account insert, gmail auto-register

      const user = await socialService.exchangeSocialCode('google', 'auth-code', 'cv-123')
      expect(user).toBeDefined()
    })

    it('logs in existing social user', async () => {
      // Existing social account found
      mockExecuteTakeFirst
        .mockResolvedValueOnce({ user_id: 'existing-user' }) // social account found
        .mockResolvedValueOnce({ id: 'existing-user', is_active: true }) // user lookup
      mockExecute.mockResolvedValue([]) // update
      mockExecuteTakeFirstOrThrow.mockResolvedValue({ id: 'existing-user', email: 'user@gmail.com', role: 'user', display_name: 'Test', avatar_url: null })

      const user = await socialService.exchangeSocialCode('google', 'code', 'cv')
      expect(user.id).toBe('existing-user')
    })

    it('throws when user is disabled', async () => {
      mockExecuteTakeFirst
        .mockResolvedValueOnce({ user_id: 'disabled-user' }) // social account found
        .mockResolvedValueOnce({ id: 'disabled-user', is_active: false }) // user disabled

      await expect(
        socialService.exchangeSocialCode('google', 'code', 'cv'),
      ).rejects.toThrow('Account is disabled')
    })
  })
})
