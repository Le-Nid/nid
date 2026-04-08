import { getDb } from '../db'
import { getGmailClient } from '../gmail/gmail.service'
import { gmailRetry } from '../gmail/gmail-throttle'
import { trackApiCall } from '../gmail/quota.service'
import { createLogger } from '../logger'

const logger = createLogger('tracking-pixel')

// Known tracking domains (common ESP pixel trackers)
const TRACKING_DOMAINS = new Set([
  'mailchimp.com', 'list-manage.com',
  'sendgrid.net', 'sendgrid.com',
  'mailgun.org', 'mailgun.com',
  'constantcontact.com', 'ctctcdn.com',
  'hubspot.com', 'hsforms.com', 'hs-analytics.net',
  'klaviyo.com',
  'brevo.com', 'sendinblue.com',
  'mailjet.com',
  'campaign-archive.com',
  'convertkit.com',
  'drip.com',
  'activecampaign.com',
  'aweber.com',
  'getresponse.com',
  'intercom.io',
  'customer.io',
  'postmarkapp.com',
  'amazonses.com',
  'exacttarget.com', 'salesforce.com',
  'marketo.com', 'mktoresp.com',
  'pardot.com',
  'litmus.com',
  'returnpath.net',
  'doubleclick.net',
  'google-analytics.com',
  'facebook.com', 'facebook.net',
  'linkedin.com',
  'twitter.com', 'x.com',
])

// UTM parameters indicating tracking
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

export interface TrackerInfo {
  type: 'pixel' | 'utm' | 'known_domain'
  domain?: string
  url?: string
  params?: string[]
}

/**
 * Detect tracking pixels in an HTML email body.
 */
export function detectTrackingPixels(html: string): TrackerInfo[] {
  const trackers: TrackerInfo[] = []
  const seen = new Set<string>()

  // 1. Detect 1x1 pixel images
  const imgRegex = /<img[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0]

    // Check for 1x1 dimensions
    const widthMatch = tag.match(/width\s*=\s*["']?\s*(0|1)\s*["']?/i)
    const heightMatch = tag.match(/height\s*=\s*["']?\s*(0|1)\s*["']?/i)
    const styleMatch = tag.match(/style\s*=\s*["'][^"']*(?:width|height)\s*:\s*[01]px[^"']*["']/i)
    const isHidden = tag.match(/display\s*:\s*none/i) || tag.match(/visibility\s*:\s*hidden/i)

    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i)
    const src = srcMatch?.[1] ?? ''

    const isPixel = (widthMatch && heightMatch) || styleMatch || isHidden

    if (isPixel && src && !seen.has(src)) {
      seen.add(src)
      trackers.push({ type: 'pixel', url: src, domain: extractDomain(src) })
      continue
    }

    // 2. Check for known tracking domains
    if (src) {
      const domain = extractDomain(src)
      if (domain && isTrackingDomain(domain) && !seen.has(src)) {
        seen.add(src)
        trackers.push({ type: 'known_domain', domain, url: src })
        continue
      }
    }
  }

  // 3. Check links for UTM parameters
  const linkRegex = /href\s*=\s*["']([^"']+)["']/gi
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1]
    try {
      const parsed = new URL(url)
      const utmFound = UTM_PARAMS.filter((p) => parsed.searchParams.has(p))
      if (utmFound.length > 0) {
        const key = `utm:${parsed.hostname}`
        if (!seen.has(key)) {
          seen.add(key)
          trackers.push({ type: 'utm', domain: parsed.hostname, params: utmFound })
        }
      }
    } catch {
      // Not a valid URL, skip
    }
  }

  return trackers
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

function isTrackingDomain(hostname: string): boolean {
  const parts = hostname.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const domain = parts.slice(i).join('.')
    if (TRACKING_DOMAINS.has(domain)) return true
  }
  return false
}

/**
 * Scan Gmail messages for tracking pixels.
 * Fetches full HTML of recent messages and analyzes them.
 */
export async function scanTrackingPixels(
  accountId: string,
  options: { maxMessages?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ scanned: number; tracked: number; newFindings: number }> {
  const { maxMessages = 200, onProgress } = options
  const db = getDb()
  const gmail = await getGmailClient(accountId)

  // Get already scanned message IDs
  const existing = await db
    .selectFrom('tracking_pixels')
    .select('gmail_message_id')
    .where('gmail_account_id', '=', accountId)
    .execute()
  const scannedIds = new Set(existing.map((r) => r.gmail_message_id))

  // List recent messages
  const listRes = await gmailRetry(() =>
    gmail.users.messages.list({ userId: 'me', maxResults: maxMessages }),
  )
  trackApiCall(accountId, 'messages.list').catch(() => {})
  const messageIds = (listRes.data.messages ?? [])
    .map((m: any) => m.id!)
    .filter((id: string) => !scannedIds.has(id))

  let tracked = 0
  let newFindings = 0

  for (let i = 0; i < messageIds.length; i++) {
    try {
      const msgRes = await gmailRetry(() =>
        gmail.users.messages.get({ userId: 'me', id: messageIds[i], format: 'full' }),
      )
      trackApiCall(accountId, 'messages.get').catch(() => {})
      const msg = msgRes.data
      const html = extractHtmlBody(msg.payload)

      const headers = msg.payload?.headers ?? []
      const get = (name: string) =>
        headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

      if (html) {
        const trackers = detectTrackingPixels(html)
        if (trackers.length > 0) {
          tracked++
          newFindings++
          await db
            .insertInto('tracking_pixels')
            .values({
              gmail_account_id: accountId,
              gmail_message_id: messageIds[i],
              subject: get('Subject'),
              sender: get('From'),
              date: get('Date') ? new Date(get('Date')!) : null,
              trackers: JSON.stringify(trackers),
              tracker_count: trackers.length,
            })
            .onConflict((oc) =>
              oc.constraint('tracking_pixels_account_message').doUpdateSet({
                trackers: JSON.stringify(trackers),
                tracker_count: trackers.length,
                scanned_at: new Date(),
              }),
            )
            .execute()
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan message ${messageIds[i]}: ${(err as Error).message}`)
    }

    onProgress?.(i + 1, messageIds.length)
  }

  return { scanned: messageIds.length, tracked, newFindings }
}

/**
 * Extract HTML body from Gmail message payload (recursive part walk).
 */
function extractHtmlBody(payload: any): string | null {
  if (!payload) return null

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtmlBody(part)
      if (html) return html
    }
  }
  return null
}

/**
 * Get tracking pixel stats for an account.
 */
export async function getTrackingStats(accountId: string) {
  const db = getDb()

  const total = await db
    .selectFrom('tracking_pixels')
    .where('gmail_account_id', '=', accountId)
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()

  const byDomain = await db
    .selectFrom('tracking_pixels')
    .where('gmail_account_id', '=', accountId)
    .select((eb) => [
      eb.fn.countAll<number>().as('count'),
    ])
    .execute()

  // Aggregate tracker domains from JSONB
  const rows = await db
    .selectFrom('tracking_pixels')
    .where('gmail_account_id', '=', accountId)
    .select(['trackers', 'tracker_count'])
    .execute()

  const domainCounts: Record<string, number> = {}
  for (const row of rows) {
    const trackers = row.trackers as TrackerInfo[]
    for (const t of trackers) {
      if (t.domain) {
        domainCounts[t.domain] = (domainCounts[t.domain] ?? 0) + 1
      }
    }
  }

  const topDomains = Object.entries(domainCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([domain, count]) => ({ domain, count }))

  return {
    trackedMessages: total.count,
    totalTrackers: rows.reduce((s, r) => s + r.tracker_count, 0),
    topDomains,
  }
}

/**
 * List tracked messages with pagination.
 */
export async function listTrackedMessages(
  accountId: string,
  opts: { limit: number; offset: number },
) {
  const db = getDb()

  const [rows, countResult] = await Promise.all([
    db
      .selectFrom('tracking_pixels')
      .where('gmail_account_id', '=', accountId)
      .select(['id', 'gmail_message_id', 'subject', 'sender', 'date', 'trackers', 'tracker_count', 'scanned_at'])
      .orderBy('date', 'desc')
      .limit(opts.limit)
      .offset(opts.offset)
      .execute(),
    db
      .selectFrom('tracking_pixels')
      .where('gmail_account_id', '=', accountId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
  ])

  return { items: rows, total: countResult.count }
}
