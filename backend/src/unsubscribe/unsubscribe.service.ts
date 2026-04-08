import { google, gmail_v1 } from 'googleapis'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry, limitConcurrency } from '../gmail/gmail-throttle'
import { trackApiCall } from '../gmail/quota.service'
import { config } from '../config'
import { createLogger } from '../logger'

const logger = createLogger('unsubscribe')

export interface NewsletterSender {
  sender: string
  email: string
  count: number
  totalSizeBytes: number
  unsubscribeUrl: string | null
  unsubscribeMailto: string | null
  latestDate: string
  sampleMessageIds: string[]
}

// ─── Scan newsletters via List-Unsubscribe headers ──────
export async function scanNewsletters(
  accountId: string,
  onProgress?: (done: number, total: number) => void
): Promise<NewsletterSender[]> {
  logger.info({ accountId }, 'scanning newsletters')
  const gmail = await getGmailClient(accountId)
  const senderMap = new Map<string, NewsletterSender>()

  let pageToken: string | undefined
  let totalFetched = 0

  // List messages with List-Unsubscribe header (Gmail search supports this)
  do {
    const listRes = await gmailRetry(() => gmail.users.messages.list({
      userId: 'me',
      q: 'list:""',  // matches messages with List-* headers
      maxResults: 500,
      pageToken,
    }))
    trackApiCall(accountId, 'messages.list').catch(() => {})

    const messageIds = (listRes.data.messages ?? []).map((m: gmail_v1.Schema$Message) => m.id!)
    if (messageIds.length === 0) break

    // Batch fetch metadata including List-Unsubscribe
    for (let i = 0; i < messageIds.length; i += config.GMAIL_BATCH_SIZE) {
      const chunk = messageIds.slice(i, i + config.GMAIL_BATCH_SIZE)

      const fetched = await limitConcurrency(
        chunk.map((id: string) => () =>
          gmailRetry(() =>
            gmail.users.messages
              .get({
                userId: 'me',
                id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'Date', 'List-Unsubscribe'],
              })
              .then((r: any) => { trackApiCall(accountId, 'messages.get').catch(() => {}); return r.data })
          )
        ),
        config.GMAIL_CONCURRENCY
      )

      for (const msg of fetched) {
        const headers = msg.payload?.headers ?? []
        const getH = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        const unsubHeader = getH('List-Unsubscribe')
        if (!unsubHeader) continue

        const from = getH('From')
        const email = extractEmail(from)
        const key = email.toLowerCase()

        const { url, mailto } = parseUnsubscribeHeader(unsubHeader)

        const existing = senderMap.get(key)
        if (existing) {
          existing.count++
          existing.totalSizeBytes += msg.sizeEstimate ?? 0
          if (existing.sampleMessageIds.length < 5) {
            existing.sampleMessageIds.push(msg.id!)
          }
          // Keep most recent date
          const newDate = getH('Date')
          if (newDate && new Date(newDate) > new Date(existing.latestDate)) {
            existing.latestDate = newDate
          }
          // Prefer URL over mailto
          if (!existing.unsubscribeUrl && url) existing.unsubscribeUrl = url
          if (!existing.unsubscribeMailto && mailto) existing.unsubscribeMailto = mailto
        } else {
          senderMap.set(key, {
            sender: from,
            email: key,
            count: 1,
            totalSizeBytes: msg.sizeEstimate ?? 0,
            unsubscribeUrl: url,
            unsubscribeMailto: mailto,
            latestDate: getH('Date') || new Date().toISOString(),
            sampleMessageIds: [msg.id!],
          })
        }
      }

      totalFetched += chunk.length
      onProgress?.(totalFetched, listRes.data.resultSizeEstimate ?? totalFetched)

      if (i + config.GMAIL_BATCH_SIZE < messageIds.length) {
        await sleep(config.GMAIL_THROTTLE_MS)
      }
    }

    pageToken = listRes.data.nextPageToken ?? undefined
  } while (pageToken)

  // Sort by count descending
  return [...senderMap.values()].sort((a, b) => b.count - a.count)
}

// ─── Get all message IDs for a specific newsletter sender ─
export async function getNewsletterMessageIds(
  accountId: string,
  senderEmail: string
): Promise<string[]> {
  const gmail = await getGmailClient(accountId)
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const res = await gmailRetry(() => gmail.users.messages.list({
      userId: 'me',
      q: `from:(${senderEmail}) list:""`,
      maxResults: 500,
      pageToken,
    }))
    trackApiCall(accountId, 'messages.list').catch(() => {})
    ids.push(...(res.data.messages ?? []).map((m: gmail_v1.Schema$Message) => m.id!))
    pageToken = res.data.nextPageToken ?? undefined
    if (pageToken) await new Promise((r) => setTimeout(r, config.GMAIL_THROTTLE_MS))
  } while (pageToken)

  return ids
}

// ─── Helpers ────────────────────────────────────────────
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from.trim()
}

function parseUnsubscribeHeader(header: string): { url: string | null; mailto: string | null } {
  let url: string | null = null
  let mailto: string | null = null

  // Header format: <https://...>, <mailto:...>
  const parts = header.split(',').map((s) => s.trim())
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/)
    if (!match) continue
    const value = match[1]
    if (value.startsWith('http://') || value.startsWith('https://')) {
      url = value
    } else if (value.startsWith('mailto:')) {
      mailto = value
    }
  }

  return { url, mailto }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
