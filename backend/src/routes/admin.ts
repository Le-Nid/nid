import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { getDb } from '../db'
import { sql } from 'kysely'
import { escapeIlike, notFound } from '../utils/db'
import { extractPagination } from '../utils/pagination'
import { authPresets } from '../utils/auth'
import { getInstanceQuotaStats } from '../gmail/quota.service'
import { emptyAllArchiveTrash, getArchiveTrashSummary } from '../archive/trash.service'
import { getLastIntegrityCheck } from '../archive/integrity.service'
import { logAudit } from '../audit/audit.service'
import { deleteUser } from '../account/account.service'

const updateUserSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional(),
  max_gmail_accounts: z.number().int().min(1).max(50).optional(),
  storage_quota_bytes: z.number().int().min(0).optional(),
})

const resetPasswordSchema = z.object({ password: z.string().min(8).max(128) })

const auditQuerySchema = z.object({
  user: z.string().trim().max(255).optional(),
  action: z.string().max(64).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
})

export async function adminRoutes(app: FastifyInstance) {
  const { adminAuth } = authPresets(app)
  const db = getDb()

  // ─── Liste des utilisateurs ────────────────────────────────
  app.get('/users', adminAuth, async (request) => {
    const { search, ...paginationQuery } = request.query as {
      page?: string; limit?: string; search?: string
    }

    const { page, limit: lim, offset } = extractPagination(paginationQuery)

    let base = db.selectFrom('users')
    if (search) {
      base = base.where((eb) =>
        eb.or([
          eb('email', 'ilike', `%${escapeIlike(search)}%`),
          eb('display_name', 'ilike', `%${escapeIlike(search)}%`),
        ])
      )
    }

    const users = await base
      .select([
        'id', 'email', 'role', 'display_name', 'avatar_url',
        'is_active', 'max_gmail_accounts', 'storage_quota_bytes',
        'last_login_at', 'created_at',
      ])
      .orderBy('created_at', 'desc')
      .limit(lim).offset(offset).execute()

    // The total follows the search, or the pagination shows pages of nothing
    const total = await base.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow()

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
      total: Number(total.count),
      page,
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

    if (!user) return notFound(reply, 'User not found')

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

    if (!updated) return notFound(reply, 'User not found')
    return updated
  })

  // ─── Réinitialiser le mot de passe (déconnecte ses sessions) ─
  app.post('/users/:userId/password', adminAuth, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const { password } = resetPasswordSchema.parse(request.body)

    const updated = await db
      .updateTable('users')
      .set({ password_hash: await bcrypt.hash(password, 12), password_changed_at: new Date(), updated_at: new Date() })
      .where('id', '=', userId)
      .returning('email')
      .executeTakeFirst()

    if (!updated) return notFound(reply, 'User not found')
    await logAudit(request.user.sub, 'admin.reset_password', {
      targetType: 'user', targetId: userId, details: { email: updated.email }, ipAddress: request.ip,
    })
    return reply.code(204).send()
  })

  // ─── Supprimer un utilisateur (irréversible) ──────────────
  app.delete('/users/:userId', adminAuth, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    if (userId === request.user.sub) return reply.code(400).send({ error: 'Use account settings to delete yourself' })

    const { email } = await deleteUser(userId)
    await logAudit(request.user.sub, 'admin.delete_user', {
      targetType: 'user', targetId: userId, details: { email }, ipAddress: request.ip,
    })
    return reply.code(204).send()
  })

  // ─── Vue globale des jobs ─────────────────────────────────
  app.get('/jobs', adminAuth, async (request) => {
    const { status, page: pageStr, limit: limitStr } = request.query as {
      status?: string; page?: string; limit?: string
    }

    const { page, limit: lim, offset } = extractPagination({ page: pageStr, limit: limitStr })

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

    return { jobs, total: jobsCount.rows[0].count, page, limit: lim }
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

  // ─── Quota Gmail API de l'instance (B13) ───────────────────
  app.get('/quota', adminAuth, async () => getInstanceQuotaStats())

  // ─── Journal d'audit de l'instance (B14) ───────────────────
  app.get('/audit', adminAuth, async (request) => {
    const { user, action, ...paginationQuery } = auditQuerySchema.parse(request.query)
    const { page, limit: lim, offset } = extractPagination(paginationQuery)

    let base = db.selectFrom('audit_logs').leftJoin('users', 'users.id', 'audit_logs.user_id')
    if (user) base = base.where('users.email', 'ilike', `%${escapeIlike(user)}%`)
    if (action) base = base.where('audit_logs.action', '=', action)

    const logs = await base
      .select([
        'audit_logs.id', 'audit_logs.user_id', 'users.email as user_email', 'audit_logs.action',
        'audit_logs.target_type', 'audit_logs.target_id', 'audit_logs.details', 'audit_logs.created_at',
      ])
      .orderBy('audit_logs.created_at', 'desc')
      .limit(lim)
      .offset(offset)
      .execute()
    const counted = await base.select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirst()
    // Choices of the action filter
    const actions = await db.selectFrom('audit_logs').select('action').distinct().orderBy('action').execute()

    return { logs, total: Number(counted?.count ?? 0), page, limit: lim, actions: actions.map((a) => a.action) }
  })

  // ─── Système : corbeille et intégrité de l'instance (B15) ───
  app.get('/system', adminAuth, async () => ({
    trash: await getArchiveTrashSummary(),
    integrity: await getLastIntegrityCheck(),
  }))

  // ─── Vider la corbeille des archives de tous les comptes (B15) ─
  app.delete('/archive-trash', adminAuth, async (request) => {
    const result = await emptyAllArchiveTrash()
    await logAudit(request.user.sub, 'admin.empty_archive_trash', { details: result, ipAddress: request.ip })
    return result
  })
}
