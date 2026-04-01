import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { NOTIFICATION_DEFAULTS } from '../notifications/notification-prefs.service'
import { extractPagination } from '../utils/pagination'
import { authPresets } from '../utils/auth'

export async function notificationsRoutes(app: FastifyInstance) {
  const db = getDb()
  const { auth } = authPresets(app)

  // ─── List notifications for current user ──────────────
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    const { unread_only, page: pageStr, limit: limitStr } = request.query as Record<string, string>

    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr }, 20)

    let query = db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)

    if (unread_only === '1' || unread_only === 'true') {
      query = query.where('is_read', '=', false)
    }

    const notifications = await query
      .orderBy('created_at', 'desc')
      .limit(lim)
      .offset(offset)
      .execute()

    const { count } = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .executeTakeFirstOrThrow()

    return { notifications, unreadCount: Number(count), page, limit: lim }
  })

  // ─── Mark one as read ─────────────────────────────────
  app.patch('/:notificationId/read', auth, async (request, reply) => {
    const userId = request.user.sub
    const { notificationId } = request.params as { notificationId: string }

    const db = getDb()
    await db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .execute()

    return { ok: true }
  })

  // ─── Mark all as read ─────────────────────────────────
  app.patch('/read-all', auth, async (request) => {
    const userId = request.user.sub

    await db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .execute()

    return { ok: true }
  })

  // ─── Delete one notification ──────────────────────────
  app.delete('/:notificationId', auth, async (request) => {
    const userId = request.user.sub
    const { notificationId } = request.params as { notificationId: string }

    await db
      .deleteFrom('notifications')
      .where('id', '=', notificationId)
      .where('user_id', '=', userId)
      .execute()

    return { ok: true }
  })

  // ─── Delete all read notifications ────────────────────
  app.delete('/', auth, async (request) => {
    const userId = request.user.sub

    await db
      .deleteFrom('notifications')
      .where('user_id', '=', userId)
      .where('is_read', '=', true)
      .execute()

    return { ok: true }
  })

  // ─── Get notification preferences ────────────────────
  app.get('/preferences', auth, async (request) => {
    const userId = request.user.sub

    const row = await db
      .selectFrom('notification_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!row) return NOTIFICATION_DEFAULTS

    return {
      weekly_report: row.weekly_report,
      job_completed: row.job_completed,
      job_failed: row.job_failed,
      rule_executed: row.rule_executed,
      quota_warning: row.quota_warning,
      integrity_alert: row.integrity_alert,
      weekly_report_toast: row.weekly_report_toast,
      job_completed_toast: row.job_completed_toast,
      job_failed_toast: row.job_failed_toast,
      rule_executed_toast: row.rule_executed_toast,
      quota_warning_toast: row.quota_warning_toast,
      integrity_alert_toast: row.integrity_alert_toast,
    }
  })

  // ─── Update notification preferences ─────────────────
  app.put('/preferences', auth, async (request) => {
    const userId = request.user.sub
    const body = request.body as Record<string, boolean>

    // Filter only valid keys
    const allowed = [
      'weekly_report', 'job_completed', 'job_failed', 'rule_executed', 'quota_warning', 'integrity_alert',
      'weekly_report_toast', 'job_completed_toast', 'job_failed_toast', 'rule_executed_toast', 'quota_warning_toast', 'integrity_alert_toast',
    ]
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') updates[key] = body[key]
    }

    const existing = await db
      .selectFrom('notification_preferences')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (existing) {
      await db
        .updateTable('notification_preferences')
        .set({ ...updates, updated_at: new Date() })
        .where('user_id', '=', userId)
        .execute()
    } else {
      await db
        .insertInto('notification_preferences')
        .values({ user_id: userId, ...updates } as any)
        .execute()
    }

    return { ok: true }
  })
}
