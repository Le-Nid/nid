import { FastifyInstance } from 'fastify'
import { getDb } from '../db'

export async function auditRoutes(app: FastifyInstance) {
  // User's own audit log
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { sub: userId } = request.user as { sub: string }
    const { page = '1', limit = '50', action } = request.query as Record<string, string>

    const db = getDb()
    const offset = (Number.parseInt(page) - 1) * Number.parseInt(limit)
    const lim = Number.parseInt(limit)

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

    return { logs, total: Number(count), page: Number.parseInt(page), limit: lim }
  })
}
