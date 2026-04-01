import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { authPresets } from '../utils/auth'
import { notFound } from '../utils/db'

export async function savedSearchRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  const db = getDb()

  // ─── List saved searches ──────────────────────────────────
  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    return db
      .selectFrom('saved_searches')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute()
  })

  // ─── Create saved search ─────────────────────────────────
  app.post('/', auth, async (request, reply) => {
    const userId = request.user.sub
    const { name, query, icon, color } = request.body as {
      name: string
      query: string
      icon?: string
      color?: string
    }

    if (!name?.trim() || !query?.trim()) {
      return reply.code(400).send({ error: 'name and query are required' })
    }

    const search = await db
      .insertInto('saved_searches')
      .values({
        user_id: userId,
        name: name.trim().slice(0, 255),
        query: query.trim().slice(0, 2000),
        icon: icon?.slice(0, 64) ?? null,
        color: color?.slice(0, 32) ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return reply.code(201).send(search)
  })

  // ─── Update saved search ─────────────────────────────────
  app.put('/:searchId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { searchId } = request.params as { searchId: string }
    const { name, query, icon, color, sort_order } = request.body as {
      name?: string
      query?: string
      icon?: string
      color?: string
      sort_order?: number
    }

    const existing = await db
      .selectFrom('saved_searches')
      .select('id')
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!existing) return notFound(reply)

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (name !== undefined) updates.name = name.trim().slice(0, 255)
    if (query !== undefined) updates.query = query.trim().slice(0, 2000)
    if (icon !== undefined) updates.icon = icon?.slice(0, 64) ?? null
    if (color !== undefined) updates.color = color?.slice(0, 32) ?? null
    if (sort_order !== undefined) updates.sort_order = sort_order

    const updated = await db
      .updateTable('saved_searches')
      .set(updates)
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow()

    return updated
  })

  // ─── Delete saved search ─────────────────────────────────
  app.delete('/:searchId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { searchId } = request.params as { searchId: string }

    const result = await db
      .deleteFrom('saved_searches')
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!result.numDeletedRows) return notFound(reply)
    return { ok: true }
  })

  // ─── Reorder saved searches ───────────────────────────────
  app.put('/reorder', auth, async (request) => {
    const userId = request.user.sub
    const { ids } = request.body as { ids: string[] }

    if (!Array.isArray(ids)) return { ok: false }

    for (let i = 0; i < ids.length; i++) {
      await db
        .updateTable('saved_searches')
        .set({ sort_order: i, updated_at: new Date() })
        .where('id', '=', ids[i])
        .where('user_id', '=', userId)
        .execute()
    }

    return { ok: true }
  })
}
