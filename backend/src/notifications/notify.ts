import { getDb } from '../db'
import { shouldNotify, type NotifCategory } from './notification-prefs.service'
import { triggerWebhooks, type WebhookEvent } from '../webhooks/webhook.service'

/**
 * Maps notification categories to webhook event names.
 */
const CATEGORY_TO_WEBHOOK: Record<string, WebhookEvent> = {
  weekly_report: 'job.completed',     // weekly_report has no direct webhook event
  job_completed: 'job.completed',
  job_failed: 'job.failed',
  rule_executed: 'rule.executed',
  quota_warning: 'quota.warning',
  integrity_alert: 'integrity.failed',
}

interface NotifyOptions {
  userId: string
  /** Notification category (matches DB columns in notification_preferences) */
  category: 'weekly_report' | 'job_completed' | 'job_failed' | 'rule_executed' | 'quota_warning' | 'integrity_alert'
  title: string
  body?: string
  data?: Record<string, unknown>
}

/**
 * Unified notification dispatcher.
 * 1. Checks in-app preference → inserts into `notifications` table if enabled
 * 2. Triggers matching webhooks (Discord, Slack, Ntfy, generic…) if any are configured
 *
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const { userId, category, title, body, data } = opts

  // 1. In-app notification
  try {
    const inAppEnabled = await shouldNotify(userId, category as NotifCategory)
    if (inAppEnabled) {
      const db = getDb()
      await db
        .insertInto('notifications')
        .values({
          user_id: userId,
          type: category,
          title,
          body: body ?? null,
          data: data ? JSON.stringify(data) : null,
        })
        .execute()
    }
  } catch (err) {
    console.error(`[notify] Failed to create in-app notification for ${category}:`, (err as Error).message)
  }

  // 2. Webhooks
  try {
    const webhookEvent = CATEGORY_TO_WEBHOOK[category]
    if (webhookEvent) {
      await triggerWebhooks(userId, webhookEvent, {
        category,
        title,
        body: body ?? undefined,
        ...data,
      })
    }
  } catch (err) {
    console.error(`[notify] Failed to trigger webhooks for ${category}:`, (err as Error).message)
  }
}
