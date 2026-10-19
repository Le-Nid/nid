import { getDb } from '../db'
import * as crypto from 'crypto'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { config } from '../config'
import { createLogger } from '../logger'

const logger = createLogger('webhook')

export type WebhookEvent =
  | 'job.completed'
  | 'job.failed'
  | 'rule.executed'
  | 'quota.warning'
  | 'integrity.failed'

// Loopback, private, link-local (cloud metadata), CGNAT and unspecified ranges
const privateNetworks = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
  privateNetworks.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
  privateNetworks.addSubnet(net, prefix, 'ipv6')
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address
  return privateNetworks.check(mapped, isIP(mapped) === 6 ? 'ipv6' : 'ipv4')
}

/**
 * Any user can register a webhook URL, so refuse the internal network unless the admin allows it.
 * shortcut: DNS is resolved again by fetch (rebinding window), pin the resolved IP if this app is exposed publicly.
 */
async function assertPublicUrl(url: string) {
  if (config.WEBHOOK_ALLOW_PRIVATE_NETWORKS) return
  const { hostname } = new URL(url)
  const host = hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`Webhook target ${hostname} is on a private network (set WEBHOOK_ALLOW_PRIVATE_NETWORKS=true to allow)`)
  }
}

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
    await assertPublicUrl(webhook.url)
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      redirect: 'error', // a redirect could point back to the internal network
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
