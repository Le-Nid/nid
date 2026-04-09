import { getDb } from '../db'
import * as crypto from 'crypto'
import { createLogger } from '../logger'

const logger = createLogger('webhook')

export type WebhookEvent =
  | 'job.completed'
  | 'job.failed'
  | 'rule.executed'
  | 'quota.warning'
  | 'integrity.failed'

interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

export async function triggerWebhooks(userId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const db = getDb()

  const webhooks = await db
    .selectFrom('webhooks')
    .selectAll()
    .where('user_id', '=', userId)
    .where('is_active', '=', true)
    .execute()

  const matching = webhooks.filter((w) => w.events.includes(event))
  if (matching.length === 0) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    // Only send non-sensitive summary fields
    data: {
      ...(data.jobId ? { jobId: data.jobId } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.count !== undefined ? { count: data.count } : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(data.title ? { title: data.title } : {}),
      ...(data.body ? { body: data.body } : {}),
    },
  }

  for (const webhook of matching) {
    sendWebhook(webhook, payload).catch((err) => {
      logger.error(`[Webhook] Failed to send to ${webhook.url}: ${err.message}`)
    })
  }
}

async function sendWebhook(
  webhook: { id: string; url: string; type: string; secret: string | null; auth_user: string | null; auth_password: string | null },
  payload: WebhookPayload,
) {
  const db = getDb()
  let body: string
  const headers: Record<string, string> = {}

  switch (webhook.type) {
    case 'discord': {
      const title = (payload.data.title as string) || payload.event
      const desc = (payload.data.body as string) || JSON.stringify(payload.data, null, 2).slice(0, 2000)
      body = JSON.stringify({
        embeds: [{
          title: `📬 ${title}`,
          description: desc,
          color: payload.event.includes('failed') ? 0xff0000 : 0x00cc00,
          timestamp: payload.timestamp,
        }],
      })
      headers['Content-Type'] = 'application/json'
      break
    }
    case 'slack': {
      const title = (payload.data.title as string) || payload.event
      const desc = (payload.data.body as string) || JSON.stringify(payload.data, null, 2).slice(0, 2000)
      body = JSON.stringify({
        text: `*${title}*\n${desc}`,
      })
      headers['Content-Type'] = 'application/json'
      break
    }
    case 'ntfy': {
      const title = (payload.data.title as string) || payload.event
      body = (payload.data.body as string) || JSON.stringify(payload.data)
      headers['Title'] = `Nid: ${title}`
      headers['Priority'] = payload.event.includes('failed') ? '4' : '3'
      headers['Tags'] = payload.event.includes('failed') ? 'warning' : 'white_check_mark'
      if (webhook.auth_user && webhook.auth_password) {
        const credentials = Buffer.from(`${webhook.auth_user}:${webhook.auth_password}`).toString('base64')
        headers['Authorization'] = `Basic ${credentials}`
      }
      break
    }
    default: {
      body = JSON.stringify(payload)
      headers['Content-Type'] = 'application/json'
      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(body)
          .digest('hex')
        headers['X-Webhook-Signature'] = `sha256=${signature}`
      }
      break
    }
  }

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })

    await db
      .updateTable('webhooks')
      .set({ last_triggered_at: new Date(), last_status: res.status })
      .where('id', '=', webhook.id)
      .execute()
  } catch (err: unknown) {
    await db
      .updateTable('webhooks')
      .set({ last_triggered_at: new Date(), last_status: 0 })
      .where('id', '=', webhook.id)
      .execute()
    throw err
  }
}
