import { google, gmail_v1 } from 'googleapis'
import { getAuthenticatedClient } from '../auth/oauth.service'
import { config } from '../config'
import { gmailRetry, limitConcurrency } from './gmail-throttle'

export interface MailMeta {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  sizeEstimate: number
  snippet: string
  labelIds: string[]
  hasAttachments: boolean
}

export async function getGmailClient(accountId: string) {
  const auth = await getAuthenticatedClient(accountId)
  return google.gmail({ version: 'v1', auth })
}

// ─── List messages ──────────────────────────────────────
export async function listMessages(
  accountId: string,
  opts: { query?: string; pageToken?: string; maxResults?: number } = {}
) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() =>
    gmail.users.messages.list({
      userId: 'me',
      q: opts.query,
      pageToken: opts.pageToken,
      maxResults: opts.maxResults ?? 50,
    })
  )
  return {
    messages: res.data.messages ?? [],
    nextPageToken: res.data.nextPageToken ?? null,
    resultSizeEstimate: res.data.resultSizeEstimate ?? 0,
  }
}

// ─── Get single message ─────────────────────────────────
export async function getMessage(accountId: string, messageId: string): Promise<MailMeta> {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() =>
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    })
  )
  return formatMeta(res.data)
}

// ─── Get message full (for reading + archiving) ─────────
export async function getMessageFull(accountId: string, messageId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() =>
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })
  )
  return res.data
}

// ─── Batch fetch metadata (handles quota throttling) ────
export async function batchGetMessages(
  accountId: string,
  messageIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<MailMeta[]> {
  const results: MailMeta[] = []
  const gmail = await getGmailClient(accountId)

  for (let i = 0; i < messageIds.length; i += config.GMAIL_BATCH_SIZE) {
    const chunk = messageIds.slice(i, i + config.GMAIL_BATCH_SIZE)

    const fetched = await limitConcurrency(
      chunk.map((id) => () =>
        gmailRetry(() =>
          gmail.users.messages
            .get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] })
            .then((r) => formatMeta(r.data))
        )
      ),
      config.GMAIL_CONCURRENCY
    )
    results.push(...fetched)
    onProgress?.(Math.min(i + config.GMAIL_BATCH_SIZE, messageIds.length), messageIds.length)

    // Throttle between batches
    if (i + config.GMAIL_BATCH_SIZE < messageIds.length) {
      await sleep(config.GMAIL_THROTTLE_MS)
    }
  }
  return results
}

// ─── Bulk operations ────────────────────────────────────
export async function trashMessages(accountId: string, messageIds: string[]) {
  const gmail = await getGmailClient(accountId)
  for (const chunk of chunks(messageIds, config.GMAIL_BATCH_SIZE)) {
    await limitConcurrency(
      chunk.map((id) => () => gmailRetry(() => gmail.users.messages.trash({ userId: 'me', id }))),
      config.GMAIL_CONCURRENCY
    )
    await sleep(config.GMAIL_THROTTLE_MS)
  }
}

export async function deleteMessages(accountId: string, messageIds: string[]) {
  const gmail = await getGmailClient(accountId)
  for (const chunk of chunks(messageIds, config.GMAIL_BATCH_SIZE)) {
    await limitConcurrency(
      chunk.map((id) => () => gmailRetry(() => gmail.users.messages.delete({ userId: 'me', id }))),
      config.GMAIL_CONCURRENCY
    )
    await sleep(config.GMAIL_THROTTLE_MS)
  }
}

export async function modifyMessages(
  accountId: string,
  messageIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[]
) {
  const gmail = await getGmailClient(accountId)
  for (const chunk of chunks(messageIds, config.GMAIL_BATCH_SIZE)) {
    await limitConcurrency(
      chunk.map((id) => () =>
        gmailRetry(() =>
          gmail.users.messages.modify({
            userId: 'me',
            id,
            requestBody: { addLabelIds, removeLabelIds },
          })
        )
      ),
      config.GMAIL_CONCURRENCY
    )
    await sleep(config.GMAIL_THROTTLE_MS)
  }
}

// ─── Labels ─────────────────────────────────────────────
export async function listLabels(accountId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() => gmail.users.labels.list({ userId: 'me' }))
  return res.data.labels ?? []
}

export async function createLabel(accountId: string, name: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() =>
    gmail.users.labels.create({
      userId: 'me',
      requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    })
  )
  return res.data
}

export async function deleteLabel(accountId: string, labelId: string) {
  const gmail = await getGmailClient(accountId)
  await gmailRetry(() => gmail.users.labels.delete({ userId: 'me', id: labelId }))
}

// ─── Stats for dashboard ────────────────────────────────
export async function getMailboxProfile(accountId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() => gmail.users.getProfile({ userId: 'me' }))
  return res.data
}

// ─── Helpers ────────────────────────────────────────────
function formatMeta(msg: gmail_v1.Schema$Message): MailMeta {
  const headers = msg.payload?.headers ?? []
  const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  return {
    id: msg.id!,
    threadId: msg.threadId ?? '',
    subject: get('Subject'),
    from: get('From'),
    to: get('To'),
    date: get('Date'),
    sizeEstimate: msg.sizeEstimate ?? 0,
    snippet: msg.snippet ?? '',
    labelIds: msg.labelIds ?? [],
    hasAttachments: (msg.payload?.parts ?? []).some((p) => p.filename && p.filename.length > 0),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size)
}
