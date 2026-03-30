import { getDb } from '../db'

const PREF_COLUMNS = [
  'weekly_report', 'job_completed', 'job_failed',
  'rule_executed', 'quota_warning', 'integrity_alert',
  'weekly_report_toast', 'job_completed_toast', 'job_failed_toast',
  'rule_executed_toast', 'quota_warning_toast', 'integrity_alert_toast',
] as const

export type NotifCategory = typeof PREF_COLUMNS[number]

const DEFAULTS: Record<NotifCategory, boolean> = {
  weekly_report: true,
  job_completed: true,
  job_failed: true,
  rule_executed: false,
  quota_warning: true,
  integrity_alert: true,
  weekly_report_toast: false,
  job_completed_toast: true,
  job_failed_toast: true,
  rule_executed_toast: false,
  quota_warning_toast: false,
  integrity_alert_toast: false,
}

/**
 * Returns true if the user wants to receive this notification type.
 * If no preferences row exists, returns the default value.
 */
export async function shouldNotify(userId: string, category: NotifCategory): Promise<boolean> {
  const db = getDb()
  const row = await db
    .selectFrom('notification_preferences')
    .select(category)
    .where('user_id', '=', userId)
    .executeTakeFirst()

  if (!row) return DEFAULTS[category]
  return (row as Record<string, boolean>)[category]
}

export { DEFAULTS as NOTIFICATION_DEFAULTS }
