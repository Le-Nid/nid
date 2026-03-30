import { getDb } from '../db'
import * as crypto from 'crypto'

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
    data,
  }

  for (const webhook of matching) {
    sendWebhook(webhook, payload).catch((err) => {
      console.error(`[Webhook] Failed to send to ${webhook.url}:`, err.message)
    })
  }
}

async function sendWebhook(
  webhook: { id: string; url: string; type: string; secret: string | null },
  payload: WebhookPayload,
) {
  const db = getDb()
  let body: string
  const headers: Record<string, string> = {}

  switch (webhook.type) {
    case 'discord': {
      body = JSON.stringify({
        embeds: [{
          title: `📬 ${payload.event}`,
          description: JSON.stringify(payload.data, null, 2).slice(0, 2000),
          color: payload.event.includes('failed') ? 0xff0000 : 0x00cc00,
          timestamp: payload.timestamp,
        }],
      })
      headers['Content-Type'] = 'application/json'
      break
    }
    case 'slack': {
      body = JSON.stringify({
        text: `*${payload.event}*\n\`\`\`${JSON.stringify(payload.data, null, 2).slice(0, 2000)}\`\`\``,
      })
      headers['Content-Type'] = 'application/json'
      break
    }
    case 'ntfy': {
      body = JSON.stringify(payload.data)
      headers['Title'] = `Gmail Manager: ${payload.event}`
      headers['Priority'] = payload.event.includes('failed') ? '4' : '3'
      headers['Tags'] = payload.event.includes('failed') ? 'warning' : 'white_check_mark'
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
  } catch (err: any) {
    await db
      .updateTable('webhooks')
      .set({ last_triggered_at: new Date(), last_status: 0 })
      .where('id', '=', webhook.id)
      .execute()
    throw err
  }
}
