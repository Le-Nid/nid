import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()

const chainable = () => {
  const chain: any = {
    select: () => chain,
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    insertInto: () => chain,
    values: () => chain,
    onConflict: () => chain,
    constraint: () => chain,
    doUpdateSet: () => chain,
    returning: () => chain,
    returningAll: () => chain,
    updateTable: () => chain,
    set: () => chain,
    deleteFrom: () => chain,
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
    deleteFrom: () => chainable(),
  }),
}))

vi.mock('arctic', () => {
  class MockGoogle {
    createAuthorizationURL() { return new URL('https://accounts.google.com/auth') }
    validateAuthorizationCode() {}
  }
  class MockMicrosoftEntraId {
    createAuthorizationURL() { return new URL('https://login.microsoftonline.com/auth') }
    validateAuthorizationCode() {}
  }
  class MockDiscord {
    createAuthorizationURL() { return new URL('https://discord.com/oauth2/authorize') }
    validateAuthorizationCode() {}
  }
  class MockFacebook {
    createAuthorizationURL() { return new URL('https://facebook.com/dialog/oauth') }
    validateAuthorizationCode() {}
  }
  class MockLinkedIn {
    createAuthorizationURL() { return new URL('https://linkedin.com/oauth/v2/authorization') }
    validateAuthorizationCode() {}
  }
  class MockKeyCloak {
    createAuthorizationURL() { return new URL('https://keycloak.example.com/auth') }
    validateAuthorizationCode() {}
  }
  return {
    Google: MockGoogle,
    MicrosoftEntraId: MockMicrosoftEntraId,
    Discord: MockDiscord,
    Facebook: MockFacebook,
    LinkedIn: MockLinkedIn,
    KeyCloak: MockKeyCloak,
    generateCodeVerifier: vi.fn(() => 'mock-code-verifier'),
    decodeIdToken: vi.fn(() => ({ sub: 'google-id', email: 'test@gmail.com', name: 'Test User', picture: 'https://photo.jpg' })),
  }
})

import {
  getEnabledProviders,
  isProviderEnabled,
  createAuthorizationUrl,
} from '../auth/social.service'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset _providers by reimporting
})

describe('getEnabledProviders', () => {
  it('returns array of enabled providers', () => {
    const providers = getEnabledProviders()
    expect(Array.isArray(providers)).toBe(true)
    // At least Google should be enabled since we have GOOGLE_CLIENT_ID in config mock
    expect(providers).toContain('google')
  })
})

describe('isProviderEnabled', () => {
  it('returns true for configured provider', () => {
    expect(isProviderEnabled('google')).toBe(true)
  })

  it('returns false for unconfigured provider', () => {
    // Only google is configured in mock config
    // Other providers need their config values to be set
    expect(isProviderEnabled('nonexistent' as any)).toBe(false)
  })
})

describe('createAuthorizationUrl', () => {
  it('creates URL for google with PKCE', () => {
    const result = createAuthorizationUrl('google', 'test-state')
    expect(result.url).toBeTruthy()
    expect(result.codeVerifier).toBe('mock-code-verifier')
  })

  it('throws for unconfigured provider', () => {
    expect(() => createAuthorizationUrl('nonexistent' as any, 'state')).toThrow()
  })
})
