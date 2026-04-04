import * as arctic from 'arctic'
import { config } from '../config'
import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('social-auth')

// ─── Types ──────────────────────────────────────────────────

export type SocialProvider = 'google' | 'microsoft' | 'discord' | 'facebook' | 'linkedin' | 'keycloak'

interface SocialProfile {
  id: string
  email: string
  name: string | null
  avatar: string | null
}

interface ProviderEntry {
  client: { createAuthorizationURL: (...args: any[]) => URL; validateAuthorizationCode: (...args: any[]) => Promise<arctic.OAuth2Tokens> }
  scopes: string[]
  usesPkce: boolean
  fetchProfile: (accessToken: string, tokens?: arctic.OAuth2Tokens) => Promise<SocialProfile>
}

// ─── Provider factory (lazy — only instantiate enabled ones) ─

function getRedirectUri(provider: SocialProvider): string {
  // Google uses dedicated SSO redirect URI (already registered in Google Cloud Console)
  if (provider === 'google') {
    return config.GOOGLE_SSO_REDIRECT_URI || `${config.FRONTEND_URL.replace(/\/$/, '')}/api/auth/social/google/callback`
  }
  return `${config.FRONTEND_URL.replace(/\/$/, '')}/api/auth/social/${provider}/callback`
}

function buildProviders(): Partial<Record<SocialProvider, ProviderEntry>> {
  const entries: Partial<Record<SocialProvider, ProviderEntry>> = {}

  // Google (SSO via Arctic + Gmail scopes for auto-registering Gmail account)
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    const client = new arctic.Google(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, getRedirectUri('google'))
    entries.google = {
      client,
      scopes: [
        'openid', 'profile', 'email',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels',
      ],
      usesPkce: true,
      fetchProfile: async (_accessToken, tokens) => {
        // Decode id_token directly — no extra network call needed
        const claims = arctic.decodeIdToken(tokens!.idToken())
        const c = claims as Record<string, any>
        return { id: c.sub, email: c.email, name: c.name ?? null, avatar: c.picture ?? null }
      },
    }
  }

  // Microsoft Entra ID
  if (config.MICROSOFT_CLIENT_ID && config.MICROSOFT_CLIENT_SECRET) {
    const client = new arctic.MicrosoftEntraId('common', config.MICROSOFT_CLIENT_ID, config.MICROSOFT_CLIENT_SECRET, getRedirectUri('microsoft'))
    entries.microsoft = {
      client,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      usesPkce: true,
      fetchProfile: async (accessToken) => {
        const res = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json() as Record<string, any>
        return { id: data.id, email: data.mail || data.userPrincipalName || '', name: data.displayName ?? null, avatar: null }
      },
    }
  }

  // Discord
  if (config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET) {
    const client = new arctic.Discord(config.DISCORD_CLIENT_ID, config.DISCORD_CLIENT_SECRET, getRedirectUri('discord'))
    entries.discord = {
      client,
      scopes: ['identify', 'email'],
      usesPkce: false,
      fetchProfile: async (accessToken) => {
        const res = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json() as Record<string, any>
        return {
          id: data.id,
          email: data.email ?? '',
          name: data.global_name || data.username,
          avatar: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : null,
        }
      },
    }
  }

  // Facebook (Meta)
  if (config.FACEBOOK_CLIENT_ID && config.FACEBOOK_CLIENT_SECRET) {
    const client = new arctic.Facebook(config.FACEBOOK_CLIENT_ID, config.FACEBOOK_CLIENT_SECRET, getRedirectUri('facebook'))
    entries.facebook = {
      client,
      scopes: ['email', 'public_profile'],
      usesPkce: false,
      fetchProfile: async (accessToken) => {
        const params = new URLSearchParams({ access_token: accessToken, fields: 'id,name,email,picture' })
        const res = await fetch(`https://graph.facebook.com/me?${params}`)
        const data = await res.json() as Record<string, any>
        return { id: data.id, email: data.email ?? '', name: data.name ?? null, avatar: data.picture?.data?.url ?? null }
      },
    }
  }

  // LinkedIn
  if (config.LINKEDIN_CLIENT_ID && config.LINKEDIN_CLIENT_SECRET) {
    const client = new arctic.LinkedIn(config.LINKEDIN_CLIENT_ID, config.LINKEDIN_CLIENT_SECRET, getRedirectUri('linkedin'))
    entries.linkedin = {
      client,
      scopes: ['openid', 'profile', 'email'],
      usesPkce: false,
      fetchProfile: async (accessToken) => {
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json() as Record<string, any>
        return { id: data.sub, email: data.email ?? '', name: data.name ?? null, avatar: data.picture ?? null }
      },
    }
  }

  // Keycloak
  if (config.KEYCLOAK_REALM_URL && config.KEYCLOAK_CLIENT_ID && config.KEYCLOAK_CLIENT_SECRET) {
    const client = new arctic.KeyCloak(config.KEYCLOAK_REALM_URL, config.KEYCLOAK_CLIENT_ID, config.KEYCLOAK_CLIENT_SECRET, getRedirectUri('keycloak'))
    entries.keycloak = {
      client,
      scopes: ['openid', 'profile', 'email'],
      usesPkce: true,
      fetchProfile: async (accessToken) => {
        const res = await fetch(`${config.KEYCLOAK_REALM_URL}/protocol/openid-connect/userinfo`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await res.json() as Record<string, any>
        return { id: data.sub, email: data.email ?? '', name: data.name ?? data.preferred_username ?? null, avatar: null }
      },
    }
  }

  return entries
}

let _providers: ReturnType<typeof buildProviders> | null = null
function getProviders() {
  _providers ??= buildProviders()
  return _providers
}

// ─── Public API ─────────────────────────────────────────────

export function getEnabledProviders(): SocialProvider[] {
  return Object.keys(getProviders()) as SocialProvider[]
}

export function isProviderEnabled(provider: string): provider is SocialProvider {
  return provider in getProviders()
}

/**
 * Generate authorization URL + PKCE code verifier (if needed).
 * The caller must store state + codeVerifier server-side (Redis).
 */
export function createAuthorizationUrl(provider: SocialProvider, state: string): { url: string; codeVerifier: string | null } {
  const entry = getProviders()[provider]
  if (!entry) throw new Error(`Provider ${provider} is not configured`)

  let codeVerifier: string | null = null
  let url: URL

  if (entry.usesPkce) {
    codeVerifier = arctic.generateCodeVerifier()
    url = entry.client.createAuthorizationURL(state, codeVerifier, entry.scopes)
  } else {
    // Discord / Facebook / LinkedIn — no PKCE (confidential clients)
    url = entry.client.createAuthorizationURL(state, null, entry.scopes)
  }

  // Google: request offline access so we get a refresh token on first consent
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline')
  }

  return { url: url.toString(), codeVerifier }
}

/**
 * Exchange authorization code for tokens, fetch profile, find/create user.
 * For Google: also auto-registers Gmail account with access/refresh tokens.
 */
export async function exchangeSocialCode(provider: SocialProvider, code: string, codeVerifier: string | null) {
  const entry = getProviders()[provider]
  if (!entry) throw new Error(`Provider ${provider} is not configured`)

  const tokens = entry.usesPkce
    ? await entry.client.validateAuthorizationCode(code, codeVerifier!)
    : await entry.client.validateAuthorizationCode(code)

  const accessToken = tokens.accessToken()
  const profile = await entry.fetchProfile(accessToken, tokens)

  if (!profile.email) throw new Error(`No email returned from ${provider}`)

  const user = await findOrCreateUser(provider, profile)

  // Google: auto-register Gmail account with tokens
  if (provider === 'google' && accessToken) {
    await autoRegisterGmailAccount(user.id, profile.email, tokens)
  }

  return user
}

/**
 * Auto-register Gmail account from SSO tokens (non-blocking).
 */
async function autoRegisterGmailAccount(userId: string, email: string, tokens: arctic.OAuth2Tokens) {
  try {
    const db = getDb()
    const accessToken = tokens.accessToken()
    const expiresAt = tokens.accessTokenExpiresAt()
    const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null

    await db
      .insertInto('gmail_accounts')
      .values({
        user_id:       userId,
        email,
        access_token:  accessToken,
        refresh_token: refreshToken ?? '',
        token_expiry:  expiresAt,
      })
      .onConflict((oc) =>
        oc.constraint('gmail_accounts_user_email_unique').doUpdateSet({
          access_token:  (eb) => eb.ref('excluded.access_token'),
          refresh_token: (eb) =>
            eb.fn('COALESCE', [
              eb.ref('excluded.refresh_token'),
              eb.ref('gmail_accounts.refresh_token'),
            ]) as any,
          token_expiry:  (eb) => eb.ref('excluded.token_expiry'),
          updated_at:    new Date(),
        })
      )
      .execute()
  } catch (err) {
    // Non-blocking: login succeeds even if Gmail registration fails
    logger.error({ err }, 'Auto-register Gmail account failed')
  }
}

// ─── User management ────────────────────────────────────────

async function findOrCreateUser(provider: SocialProvider, profile: SocialProfile) {
  const db = getDb()

  const socialAccount = await db
    .selectFrom('user_social_accounts')
    .select(['user_id'])
    .where('provider', '=', provider)
    .where('provider_id', '=', profile.id)
    .executeTakeFirst()

  if (socialAccount) {
    return loginExistingSocialUser(socialAccount.user_id, profile)
  }

  return linkOrCreateSocialUser(provider, profile)
}

async function loginExistingSocialUser(userId: string, profile: SocialProfile) {
  const db = getDb()

  const user = await db
    .selectFrom('users')
    .select(['id', 'is_active'])
    .where('id', '=', userId)
    .executeTakeFirst()

  if (!user?.is_active) throw new Error('Account is disabled')

  await db.updateTable('users')
    .set({
      display_name: profile.name || undefined,
      avatar_url: profile.avatar || undefined,
      last_login_at: new Date(),
    })
    .where('id', '=', userId)
    .execute()

  return db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'display_name', 'avatar_url'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow()
}

async function linkOrCreateSocialUser(provider: SocialProvider, profile: SocialProfile) {
  const db = getDb()

  const existing = await db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'is_active', 'display_name', 'avatar_url'])
    .where('email', '=', profile.email)
    .executeTakeFirst()

  if (existing && !existing.is_active) throw new Error('Account is disabled')

  let userId: string

  if (existing) {
    userId = existing.id
    await db.updateTable('users')
      .set({
        display_name: existing.display_name || profile.name || null,
        avatar_url: profile.avatar || existing.avatar_url,
        last_login_at: new Date(),
      })
      .where('id', '=', userId)
      .execute()
  } else {
    if (!config.ALLOW_REGISTRATION) throw new Error('Registration is disabled')

    const role = config.ADMIN_EMAIL && profile.email === config.ADMIN_EMAIL ? 'admin' : 'user'

    const inserted = await db
      .insertInto('users')
      .values({
        email: profile.email,
        password_hash: null as any,
        display_name: profile.name || null,
        avatar_url: profile.avatar || null,
        role,
        last_login_at: new Date(),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    userId = inserted.id
  }

  // Link social account
  await db
    .insertInto('user_social_accounts')
    .values({
      user_id:      userId,
      provider,
      provider_id:  profile.id,
      email:        profile.email,
      display_name: profile.name || null,
      avatar_url:   profile.avatar || null,
    })
    .execute()

  return db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'display_name', 'avatar_url'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow()
}
