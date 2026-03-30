import { FastifyInstance } from 'fastify'
import { getDb } from '../db'

export async function notificationsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // ─── List notifications for current user ──────────────
  app.get('/', auth, async (request) => {
    const { sub: userId } = request.user as { sub: string }
    const { page = '1', limit = '20', unread_only } = request.query as Record<string, string>

    const db = getDb()
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const lim = parseInt(limit)

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

    return { notifications, unreadCount: Number(count), page: parseInt(page), limit: lim }
  })

  // ─── Mark one as read ─────────────────────────────────
  app.patch('/:notificationId/read', auth, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
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
    const { sub: userId } = request.user as { sub: string }

    const db = getDb()
    await db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .execute()

    return { ok: true }
  })
}
