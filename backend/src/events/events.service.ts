import type { Redis } from 'ioredis'
import { getRedis } from '../plugins/redis'
import { getDb } from '../db'
import { getMailboxProfile } from '../gmail/gmail.service'

// B3 (D6): per-user live events. Publishers (worker, rules routes) go through Redis pub/sub so
// they reach the SSE connections whichever process holds them.
const PREFIX = 'nid:events:'
export const userChannel = (userId: string) => PREFIX + userId

export const sseFrame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Sidebar counters (§3.1). `mails` = messagesTotal per active Gmail account (users.getProfile, 1 quota unit,
 * null when Gmail fails). shortcut: no `cleanupBytes`, it needs a size scan of the mailbox; add it once
 * Nettoyage (L6) caches that figure.
 */
export async function getCounters(userId: string) {
  const db = getDb()
  const [accounts, rules, jobs] = await Promise.all([
    db.selectFrom('mail_accounts').select('id').where('user_id', '=', userId).where('is_active', '=', true).execute(),
    db.selectFrom('rules')
      .innerJoin('mail_accounts', 'mail_accounts.id', 'rules.account_id')
      .select((eb) => eb.fn.countAll().as('n'))
      .where('mail_accounts.user_id', '=', userId)
      .where('rules.is_active', '=', true)
      .executeTakeFirst(),
    db.selectFrom('jobs').select((eb) => eb.fn.countAll().as('n'))
      .where('user_id', '=', userId).where('status', '=', 'active')
      .executeTakeFirst(),
  ])
  const mails = Object.fromEntries(await Promise.all(accounts.map(async (a) => [
    a.id,
    await getMailboxProfile(a.id).then((p) => p.messagesTotal ?? null, () => null),
  ])))
  return { mails, activeRules: Number(rules?.n ?? 0), activeJobs: Number(jobs?.n ?? 0) }
}

/** Publishes fresh counters (and an optional event) to the user's channel; computes nothing when nobody listens. */
export async function publishUserEvents(userId: string, extra?: { event: string; data: unknown }) {
  const redis = getRedis()
  const [, listeners] = (await redis.pubsub('NUMSUB', userChannel(userId))) as [string, number]
  if (!Number(listeners)) return
  if (extra) await redis.publish(userChannel(userId), sseFrame(extra.event, extra.data))
  await redis.publish(userChannel(userId), sseFrame('counters', await getCounters(userId)))
}

// ─── Subscriber side (SSE route) ────────────────────────────
type Listener = (frame: string) => void
const listeners = new Map<string, Set<Listener>>()
let subscriber: Redis | null = null

function getSubscriber(): Redis {
  if (!subscriber) {
    // A connection in subscriber mode cannot run other commands: dedicated one
    subscriber = getRedis().duplicate()
    subscriber.on('message', (channel: string, frame: string) => {
      listeners.get(channel.slice(PREFIX.length))?.forEach((l) => l(frame))
    })
  }
  return subscriber
}

/** Fans the user's channel out to `listener`; returns the unsubscribe function (last one leaves the channel). */
export async function subscribeUser(userId: string, listener: Listener): Promise<() => Promise<void>> {
  const sub = getSubscriber()
  let set = listeners.get(userId)
  if (!set) {
    set = new Set()
    listeners.set(userId, set)
    await sub.subscribe(userChannel(userId))
  }
  set.add(listener)
  return async () => {
    set.delete(listener)
    if (set.size === 0 && listeners.get(userId) === set) {
      listeners.delete(userId)
      await sub.unsubscribe(userChannel(userId))
    }
  }
}
