import { google } from 'googleapis'
import { sql } from 'kysely'
import { config } from '../config'
import { getDb } from '../db'
import { createLogger } from '../logger'
import { notify } from '../notifications/notify'

const logger = createLogger('oauth')

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  )
}

export function getGmailAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent',
    state,
  })
}

export async function exchangeGmailCode(code: string, userId: string) {
  logger.info({ userId }, 'exchanging Gmail OAuth code')
  const oauth2Client = createOAuth2Client()
  const { tokens }   = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  const oauth2    = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data }  = await oauth2.userinfo.get()

  const db = getDb()

  const account = await db
    .insertInto('mail_accounts')
    .values({
      user_id:       userId,
      email:         data.email!,
      access_token:  tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      token_expiry:  new Date(tokens.expiry_date!),
    })
    .onConflict((oc) =>
      oc.constraint('mail_accounts_user_email_unique').doUpdateSet({
        access_token:  (eb) => eb.ref('excluded.access_token'),
        // Ne pas écraser le refresh_token si absent (Google ne le renvoie qu'au 1er consent)
        refresh_token: (eb) =>
          eb.fn('COALESCE', [
            eb.ref('excluded.refresh_token'),
            eb.ref('mail_accounts.refresh_token'),
          ]) as any,
        token_expiry:  (eb) => eb.ref('excluded.token_expiry'),
        auth_error_at: null, // reconnected: « Action requise » cleared
        is_active:     true, // a disconnected account comes back on the same row, with its archives
        updated_at:    new Date(),
      })
    )
    // xmax = 0 only on a freshly inserted row: a new account (setup wizard) vs a reconnection
    .returning(['id', 'email', sql<boolean>`xmax = 0`.as('inserted')])
    .executeTakeFirstOrThrow()

  return account
}

export async function getAuthenticatedClient(accountId: string) {
  const db = getDb()

  const account = await db
    .selectFrom('mail_accounts')
    .select(['access_token', 'refresh_token', 'token_expiry', 'is_active', 'provider'])
    .where('id', '=', accountId)
    .executeTakeFirst()

  if (!account) throw new Error('Gmail account not found')
  // Every Gmail call goes through here: a clear 409 instead of a token error (error handler sends statusCode < 500)
  if (account.is_active === false) {
    throw Object.assign(new Error('Gmail account disconnected: reconnect it in Settings'), { statusCode: 409 })
  }
  if (account.provider === 'imap') {
    throw Object.assign(new Error('Not a Gmail account: only its archives are available'), { statusCode: 409 })
  }
  const expiry = account.token_expiry ? new Date(account.token_expiry).getTime() : 0

  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token:  account.access_token,
    refresh_token: account.refresh_token,
    expiry_date:   expiry,
  })

  // Auto-refresh du token
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      logger.info({ accountId }, 'OAuth token refreshed')
      await db
        .updateTable('mail_accounts')
        .set({
          access_token: tokens.access_token,
          token_expiry: new Date(tokens.expiry_date!),
          auth_error_at: null,
          updated_at:   new Date(),
        })
        .where('id', '=', accountId)
        .execute()
    }
  })

  // « Action requise » (§7.7): an expired token is refreshed here rather than inside the first Gmail call,
  // so a revoked or expired grant is recorded on the account whichever caller hits it
  if (expiry <= Date.now()) {
    try {
      await oauth2Client.getAccessToken()
    } catch (err) {
      // No refresh token stored (pre-fix SSO logins wrote ''): same outcome as a revoked grant
      if (isInvalidGrant(err) || !account.refresh_token) {
        logger.warn({ accountId }, 'Google refused the refresh token: reconnection required')
        await flagReauthRequired(accountId, 'Google')
      }
      throw err
    }
  }

  return oauth2Client
}

/**
 * « Action requise »: the provider (Google, the IMAP server) refused the account's credentials. Only the first
 * failure flags and notifies (bell + account.reauth_required webhook): every later call hits this again until reconnection.
 */
export async function flagReauthRequired(accountId: string, refusedBy: string) {
  const flagged = await getDb().updateTable('mail_accounts').set({ auth_error_at: new Date() })
    .where('id', '=', accountId).where('auth_error_at', 'is', null)
    .returning(['user_id', 'email']).executeTakeFirst()
  if (!flagged) return
  await notify({
    userId: flagged.user_id,
    category: 'account_reauth',
    title: 'Compte à reconnecter',
    body: `${refusedBy} a refusé l'accès à ${flagged.email} : reconnectez-le dans Paramètres › Comptes.`,
    data: { accountId },
  })
}

/** Google's answer when the refresh token is revoked, expired or the consent was withdrawn. */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string } | null
  return e?.response?.data?.error === 'invalid_grant' || !!e?.message?.includes('invalid_grant')
}


