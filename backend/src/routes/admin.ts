import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { sql } from 'kysely'

/** Escape ILIKE special characters (Point 10) */
function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&')
}

const updateUserSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional(),
  max_gmail_accounts: z.number().int().min(1).max(50).optional(),
  storage_quota_bytes: z.number().int().min(0).optional(),
})

export async function adminRoutes(app: FastifyInstance) {
  const adminAuth = { preHandler: [app.authenticate, app.requireAdmin] }
  const db = getDb()

  // ─── Liste des utilisateurs ────────────────────────────────
  app.get('/users', adminAuth, async (request) => {
    const { page = '1', limit = '50', search } = request.query as {
      page?: string; limit?: string; search?: string
    }

    const lim = Math.min(Number.parseInt(limit), 100)
    const offset = (Number.parseInt(page) - 1) * lim

    let query = db
      .selectFrom('users')
      .select([
        'id', 'email', 'role', 'display_name', 'avatar_url',
        'is_active', 'max_gmail_accounts', 'storage_quota_bytes',
        'last_login_at', 'created_at',
      ])
      .orderBy('created_at', 'desc')

    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('email', 'ilike', `%${escapeIlike(search)}%`),
          eb('display_name', 'ilike', `%${escapeIlike(search)}%`),
        ])
      )
    }

    const users = await query.limit(lim).offset(offset).execute()

    const totalResult = await sql<{ count: number }>`SELECT count(*)::int as count FROM users`.execute(db)

    // Compter les comptes Gmail par user
    const accounts = await sql<{ user_id: string; count: number }>`
      SELECT user_id, count(*)::int as count FROM gmail_accounts GROUP BY user_id
    `.execute(db)

    const accountMap = new Map(accounts.rows.map((a) => [a.user_id, a.count]))

    // Espace utilisé par user
    const storage = await sql<{ user_id: string; total: string }>`
      SELECT ga.user_id, COALESCE(sum(am.size_bytes), 0)::text as total
      FROM archived_mails am
      JOIN gmail_accounts ga ON am.gmail_account_id = ga.id
      GROUP BY ga.user_id
    `.execute(db)

    const storageMap = new Map(storage.rows.map((s) => [s.user_id, Number(s.total)]))

    return {
      users: users.map((u) => ({
        ...u,
        gmail_accounts_count: accountMap.get(u.id) ?? 0,
        storage_used_bytes: storageMap.get(u.id) ?? 0,
      })),
      total: totalResult.rows[0].count,
      page: Number.parseInt(page),
      limit: lim,
    }
  })

  // ─── Détail utilisateur ─────────────────────────────────────
  app.get('/users/:userId', adminAuth, async (request, reply) => {
    const { userId } = request.params as { userId: string }

    const user = await db
      .selectFrom('users')
      .select([
        'id', 'email', 'role', 'display_name', 'avatar_url',
        'is_active', 'max_gmail_accounts', 'storage_quota_bytes',
        'last_login_at', 'created_at',
      ])
      .where('id', '=', userId)
      .executeTakeFirst()

    if (!user) return reply.code(404).send({ error: 'User not found' })

    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email', 'is_active', 'created_at'])
      .where('user_id', '=', userId)
      .execute()

    const jobs = await db
      .selectFrom('jobs')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(20)
      .execute()

    return { user, gmailAccounts: accounts, recentJobs: jobs }
  })

  // ─── Modifier un utilisateur ───────────────────────────────
  app.patch('/users/:userId', adminAuth, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const dto = updateUserSchema.parse(request.body)

    if (Object.keys(dto).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    const updated = await db
      .updateTable('users')
      .set(dto as any)
      .where('id', '=', userId)
      .returning(['id', 'email', 'role', 'is_active', 'max_gmail_accounts', 'storage_quota_bytes'])
      .executeTakeFirst()

    if (!updated) return reply.code(404).send({ error: 'User not found' })
    return updated
  })

  // ─── Vue globale des jobs ─────────────────────────────────
  app.get('/jobs', adminAuth, async (request) => {
    const { status, page = '1', limit = '50' } = request.query as {
      status?: string; page?: string; limit?: string
    }

    const lim = Math.min(Number.parseInt(limit), 100)
    const offset = (Number.parseInt(page) - 1) * lim

    let query = db
      .selectFrom('jobs')
      .innerJoin('users', 'jobs.user_id', 'users.id')
      .select([
        'jobs.id', 'jobs.bullmq_id', 'jobs.type', 'jobs.status', 'jobs.progress',
        'jobs.total', 'jobs.processed', 'jobs.gmail_account_id', 'jobs.user_id',
        'jobs.error', 'jobs.created_at', 'jobs.completed_at',
        'users.email as user_email',
      ])
      .orderBy('jobs.created_at', 'desc')

    if (status) query = query.where('jobs.status', '=', status)

    const jobs = await query.limit(lim).offset(offset).execute()

    const jobsCount = await sql<{ count: number }>`SELECT count(*)::int as count FROM jobs`.execute(db)

    return { jobs, total: jobsCount.rows[0].count, page: Number.parseInt(page), limit: lim }
  })

  // ─── Statistiques globales ────────────────────────────────
  app.get('/stats', adminAuth, async () => {
    const usersCount = await sql<{ count: number }>`SELECT count(*)::int as count FROM users`.execute(db)
    const accountsCount = await sql<{ count: number }>`SELECT count(*)::int as count FROM gmail_accounts`.execute(db)

    const jobsStats = await sql<{
      total: number; completed: number; failed: number; active: number
    }>`
      SELECT
        count(*)::int as total,
        count(*) FILTER (WHERE status = 'completed')::int as completed,
        count(*) FILTER (WHERE status = 'failed')::int as failed,
        count(*) FILTER (WHERE status = 'active')::int as active
      FROM jobs
    `.execute(db)

    const archiveStats = await sql<{
      total_mails: number; total_size: string
    }>`
      SELECT count(*)::int as total_mails, COALESCE(sum(size_bytes), 0)::text as total_size
      FROM archived_mails
    `.execute(db)

    const u = usersCount.rows[0]
    const a = accountsCount.rows[0]
    const j = jobsStats.rows[0]
    const ar = archiveStats.rows[0]

    return {
      users: u.count,
      gmailAccounts: a.count,
      jobs: {
        total: j.total,
        completed: j.completed,
        failed: j.failed,
        active: j.active,
      },
      archives: {
        totalMails: ar.total_mails,
        totalSizeBytes: Number(ar.total_size ?? 0),
      },
    }
  })
}
