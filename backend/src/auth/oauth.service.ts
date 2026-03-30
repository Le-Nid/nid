import { google } from 'googleapis'
import { config } from '../config'
import { getDb } from '../db'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
]

const SSO_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  )
}

export function getGmailAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent',
    state:       userId,
  })
}

export async function exchangeGmailCode(code: string, userId: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens }   = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  const oauth2    = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data }  = await oauth2.userinfo.get()

  const db = getDb()

  const account = await db
    .insertInto('gmail_accounts')
    .values({
      user_id:       userId,
      email:         data.email!,
      access_token:  tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      token_expiry:  new Date(tokens.expiry_date!),
    })
    .onConflict((oc) =>
      oc.constraint('gmail_accounts_user_email_unique').doUpdateSet({
        access_token:  (eb) => eb.ref('excluded.access_token'),
        // Ne pas écraser le refresh_token si absent (Google ne le renvoie qu'au 1er consent)
        refresh_token: (eb) =>
          eb.fn('COALESCE', [
            eb.ref('excluded.refresh_token'),
            eb.ref('gmail_accounts.refresh_token'),
          ]) as any,
        token_expiry:  (eb) => eb.ref('excluded.token_expiry'),
        updated_at:    new Date(),
      })
    )
    .returning(['id', 'email'])
    .executeTakeFirstOrThrow()

  return account
}

export async function getAuthenticatedClient(accountId: string) {
  const db = getDb()

  const account = await db
    .selectFrom('gmail_accounts')
    .select(['access_token', 'refresh_token', 'token_expiry'])
    .where('id', '=', accountId)
    .executeTakeFirst()

  if (!account) throw new Error('Gmail account not found')

  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token:  account.access_token,
    refresh_token: account.refresh_token,
    expiry_date:   new Date(account.token_expiry).getTime(),
  })

  // Auto-refresh du token
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db
        .updateTable('gmail_accounts')
        .set({
          access_token: tokens.access_token,
          token_expiry: new Date(tokens.expiry_date!),
          updated_at:   new Date(),
        })
        .where('id', '=', accountId)
        .execute()
    }
  })

  return oauth2Client
}

// ─── Google SSO (authentification/inscription via Google) ──

function createSsoClient() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_SSO_REDIRECT_URI || config.GOOGLE_REDIRECT_URI
  )
}

export function getGoogleSsoUrl(): string {
  const client = createSsoClient()
  return client.generateAuthUrl({
    access_type: 'online',
    scope: SSO_SCOPES,
    prompt: 'select_account',
    state: 'sso',
  })
}

export async function exchangeGoogleSsoCode(code: string) {
  const client = createSsoClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()

  if (!data.email) throw new Error('Google account has no email')

  const db = getDb()
  const googleId = data.id!

  // Chercher un user existant par google_id ou email
  let user = await db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'is_active', 'google_id', 'display_name', 'avatar_url'])
    .where((eb) =>
      eb.or([
        eb('google_id', '=', googleId),
        eb('email', '=', data.email!),
      ])
    )
    .executeTakeFirst()

  if (user && !user.is_active) {
    throw new Error('Account is disabled')
  }

  if (user) {
    // Mettre à jour les infos Google si nécessaire
    await db
      .updateTable('users')
      .set({
        google_id: googleId,
        display_name: user.display_name || data.name || null,
        avatar_url: data.picture || user.avatar_url,
        last_login_at: new Date(),
      })
      .where('id', '=', user.id)
      .execute()
  } else {
    // Créer un nouveau compte — pas de mot de passe (SSO)
    const role = config.ADMIN_EMAIL && data.email === config.ADMIN_EMAIL ? 'admin' : 'user'

    const inserted = await db
      .insertInto('users')
      .values({
        email: data.email!,
        password_hash: null as any,
        google_id: googleId,
        display_name: data.name || null,
        avatar_url: data.picture || null,
        role,
        last_login_at: new Date(),
      })
      .returning(['id', 'email', 'role'])
      .executeTakeFirstOrThrow()

    user = { ...inserted, is_active: true, google_id: googleId, display_name: data.name || null, avatar_url: data.picture || null }
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
  }
}
