import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { extractPagination } from '../utils/pagination'
import { authPresets } from '../utils/auth'

export async function auditRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)

  // User's own audit log
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    const { action, page: pageStr, limit: limitStr } = request.query as Record<string, string>

    const db = getDb()
    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr })

    let query = db
      .selectFrom('audit_logs')
      .selectAll()
      .where('user_id', '=', userId)

    if (action) {
      query = query.where('action', '=', action)
    }

    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(lim)
      .offset(offset)
      .execute()

    const { count } = await db
      .selectFrom('audit_logs')
      .select((eb: any) => eb.fn.countAll().as('count'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow() as any

    return { logs, total: Number(count), page, limit: lim }
  })
}
