import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { authPresets } from '../utils/auth'
import { notFound } from '../utils/db'

// Trimmed, cut to the column size; blank refused (a chip with no label, a search that matches everything)
const text = (max: number) => z.string().trim().min(1).transform((v) => v.slice(0, max))
const optional = (max: number) => z.string().transform((v) => v.slice(0, max)).nullish()
const createSchema = z.object({ name: text(255), query: text(2000), icon: optional(64), color: optional(32) })
const updateSchema = createSchema.partial().extend({ sort_order: z.number().int().optional() })
const reorderSchema = z.object({ ids: z.array(z.string()).max(500) })

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
    const { name, query, icon, color } = createSchema.parse(request.body)

    const search = await db
      .insertInto('saved_searches')
      .values({
        user_id: userId,
        name,
        query,
        icon: icon ?? null,
        color: color ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return reply.code(201).send(search)
  })

  // ─── Update saved search ─────────────────────────────────
  app.put('/:searchId', auth, async (request, reply) => {
    const userId = request.user.sub
    const { searchId } = request.params as { searchId: string }
    const { name, query, icon, color, sort_order } = updateSchema.parse(request.body)

    const existing = await db
      .selectFrom('saved_searches')
      .select('id')
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!existing) return notFound(reply)

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (name !== undefined) updates.name = name
    if (query !== undefined) updates.query = query
    if (icon !== undefined) updates.icon = icon
    if (color !== undefined) updates.color = color
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
    const { ids } = reorderSchema.parse(request.body)

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
