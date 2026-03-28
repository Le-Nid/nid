import { google } from 'googleapis'
import { config } from '../config'
import { getDb } from '../plugins/db'

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
    scope: SCOPES,
    prompt: 'consent',  // Force refresh_token delivery
    state: userId,
  })
}

export async function exchangeGmailCode(code: string, userId: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  // Get Gmail user email
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()

  const db = getDb()
  const [account] = await db`
    INSERT INTO gmail_accounts (user_id, email, access_token, refresh_token, token_expiry)
    VALUES (
      ${userId},
      ${data.email!},
      ${tokens.access_token!},
      ${tokens.refresh_token!},
      ${new Date(tokens.expiry_date!)}
    )
    ON CONFLICT (user_id, email) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, gmail_accounts.refresh_token),
      token_expiry  = EXCLUDED.token_expiry,
      updated_at    = NOW()
    RETURNING id, email
  `
  return account
}

export async function getAuthenticatedClient(accountId: string) {
  const db = getDb()
  const [account] = await db`
    SELECT access_token, refresh_token, token_expiry
    FROM gmail_accounts WHERE id = ${accountId}
  `
  if (!account) throw new Error('Gmail account not found')

  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: new Date(account.token_expiry).getTime(),
  })

  // Auto-refresh if token is expired or expiring soon
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db`
        UPDATE gmail_accounts SET
          access_token = ${tokens.access_token},
          token_expiry = ${new Date(tokens.expiry_date!)},
          updated_at = NOW()
        WHERE id = ${accountId}
      `
    }
  })

  return oauth2Client
}
