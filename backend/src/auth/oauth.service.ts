import { google } from 'googleapis'
import { config } from '../config'
import { getDb } from '../db'

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
