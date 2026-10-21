import { google, gmail_v1 } from 'googleapis'
import { getAuthenticatedClient } from '../auth/oauth.service'
import { config } from '../config'
import { gmailRetry, limitConcurrency, withAccountLimit } from './gmail-throttle'
import { trackApiCall } from './quota.service'
import { createLogger } from '../logger'

const logger = createLogger('gmail')

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
  trackApiCall(accountId, 'messages.list').catch(() => {})
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
  trackApiCall(accountId, 'messages.get').catch(() => {})
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
  trackApiCall(accountId, 'messages.get').catch(() => {})
  return res.data
}

// ─── Batch fetch metadata (handles quota throttling) ────
export async function batchGetMessages(
  accountId: string,
  messageIds: string[],
  opts?: { onProgress?: (done: number, total: number) => void }
): Promise<MailMeta[]> {
  const t0 = Date.now()
  const gmail = await getGmailClient(accountId)
  const onProgress = opts?.onProgress

  const fetchOne = (id: string) =>
    gmail.users.messages
      .get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] })
      .then((r) => formatMeta(r.data))

  // All calls go through the global per-account semaphore (5 concurrent max).
  // No chunking or local concurrency control needed — the semaphore handles it.
  const results = await Promise.all(
    messageIds.map((id) =>
      withAccountLimit(accountId, () => gmailRetry(() => fetchOne(id)), 'messages.get')
    )
  )
  onProgress?.(messageIds.length, messageIds.length)
  logger.debug(`[batchGet] ${messageIds.length} msgs in ${Date.now() - t0}ms`)
  return results
}

// ─── Bulk operations ────────────────────────────────────
/** A message deleted in Gmail meanwhile must not fail the whole batch (expiration, rules, bulk). */
function ignoreGone(err: any) {
  const status = err?.code ?? err?.response?.status ?? err?.status
  if (status === 404 || status === 410) return
  throw err
}

export async function trashMessages(accountId: string, messageIds: string[]) {
  const gmail = await getGmailClient(accountId)
  const trashOne = async (id: string) => {
    try {
      await gmailRetry(() => gmail.users.messages.trash({ userId: 'me', id }))
      trackApiCall(accountId, 'messages.trash').catch(() => {})
    } catch (err) {
      ignoreGone(err)
    }
  }
  for (const chunk of chunks(messageIds, config.GMAIL_BATCH_SIZE)) {
    await limitConcurrency(
      chunk.map((id) => () => trashOne(id)),
      config.GMAIL_CONCURRENCY
    )
    await sleep(config.GMAIL_THROTTLE_MS)
  }
}

/** Gmail limit for users.messages.batchModify. */
const BATCH_MODIFY_MAX_IDS = 1000

export async function modifyMessages(
  accountId: string,
  messageIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[]
) {
  const gmail = await getGmailClient(accountId)
  const modifyOne = async (id: string) => {
    try {
      await gmailRetry(() =>
        gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds, removeLabelIds } })
      )
      trackApiCall(accountId, 'messages.modify').catch(() => {})
    } catch (err) {
      ignoreGone(err)
    }
  }
  const modifyEach = async (ids: string[]) => {
    for (const chunk of chunks(ids, config.GMAIL_BATCH_SIZE)) {
      await limitConcurrency(
        chunk.map((id) => () => modifyOne(id)),
        config.GMAIL_CONCURRENCY
      )
      await sleep(config.GMAIL_THROTTLE_MS)
    }
  }
  // batchModify: 50 quota units per call for up to 1000 ids, vs 5 units per message with modify
  for (const chunk of chunks(messageIds, BATCH_MODIFY_MAX_IDS)) {
    try {
      await gmailRetry(() =>
        gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids: chunk, addLabelIds, removeLabelIds } })
      )
      trackApiCall(accountId, 'messages.batchModify').catch(() => {})
    } catch (err: any) {
      const status = err?.code ?? err?.response?.status ?? err?.status
      if (status !== 400 && status !== 404) throw err
      // One id gone from Gmail meanwhile fails the whole call: redo one by one, skipping gone ids
      await modifyEach(chunk)
    }
  }
}

// ─── Labels ─────────────────────────────────────────────
export async function listLabels(accountId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() => gmail.users.labels.list({ userId: 'me' }))
  trackApiCall(accountId, 'labels.list').catch(() => {})
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
  trackApiCall(accountId, 'labels.create').catch(() => {})
  return res.data
}

export async function updateLabel(
  accountId: string,
  labelId: string,
  patch: { name?: string; color?: { backgroundColor: string; textColor: string } }
) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() =>
    gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody: patch })
  )
  trackApiCall(accountId, 'labels.patch').catch(() => {})
  return res.data
}

export async function deleteLabel(accountId: string, labelId: string) {
  const gmail = await getGmailClient(accountId)
  await gmailRetry(() => gmail.users.labels.delete({ userId: 'me', id: labelId }))
  trackApiCall(accountId, 'labels.delete').catch(() => {})
}

// ─── Stats for dashboard ────────────────────────────────
export async function getMailboxProfile(accountId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() => gmail.users.getProfile({ userId: 'me' }))
  trackApiCall(accountId, 'users.getProfile').catch(() => {})
  return res.data
}

export async function getLabelStats(accountId: string, labelId: string) {
  const gmail = await getGmailClient(accountId)
  const res = await gmailRetry(() => gmail.users.labels.get({ userId: 'me', id: labelId }))
  trackApiCall(accountId, 'labels.get').catch(() => {})
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
