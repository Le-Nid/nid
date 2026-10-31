import { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { getDb } from '../db'
import { authPresets } from '../utils/auth'

/** One small read for Home Assistant (REST sensors) or a script: everything the user's dashboard counts. */
export function summaryRoutes(app: FastifyInstance, _opts: unknown, done: () => void) {
  const db = getDb()
  const { auth } = authPresets(app)

  app.get('/', auth, async (request) => {
    const userId = request.user.sub
    const [user, accounts, jobs, unread] = await Promise.all([
      db.selectFrom('users').select('storage_quota_bytes').where('id', '=', userId).executeTakeFirstOrThrow(),
      db.selectFrom('mail_accounts')
        .leftJoin('archived_mails', (join) => join
          .onRef('archived_mails.account_id', '=', 'mail_accounts.id')
          .on('archived_mails.deleted_at', 'is', null))
        .select((eb) => [
          'mail_accounts.id', 'mail_accounts.email', 'mail_accounts.is_active', 'mail_accounts.last_backup_at',
          eb('mail_accounts.auth_error_at', 'is not', null).as('needs_reauth'),
          eb.fn.count<string>('archived_mails.id').as('archived_mails'),
          eb.fn.coalesce(eb.fn.sum<string>('archived_mails.size_bytes'), sql<string>`0`).as('archived_bytes'),
          eb.fn.max('archived_mails.archived_at').as('last_archived_at'),
        ])
        .where('mail_accounts.user_id', '=', userId)
        .groupBy('mail_accounts.id')
        .orderBy('mail_accounts.email')
        .execute(),
      db.selectFrom('jobs')
        .select((eb) => [
          eb.fn.countAll<string>().filterWhere('status', 'in', ['pending', 'active']).as('active'),
          eb.fn.countAll<string>().filterWhere((f) => f.and([
            f('status', '=', 'failed'), f('created_at', '>', sql<Date>`NOW() - INTERVAL '24 hours'`),
          ])).as('failed_24h'),
        ])
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow(),
      db.selectFrom('notifications').select((eb) => eb.fn.countAll<string>().as('count'))
        .where('user_id', '=', userId).where('is_read', '=', false).executeTakeFirstOrThrow(),
    ])

    // Plain numbers (pg returns bigint counts as strings): Home Assistant templates compare them directly
    const rows = accounts.map((a) => ({ ...a, archived_mails: Number(a.archived_mails), archived_bytes: Number(a.archived_bytes) }))
    return {
      accounts: rows,
      needs_reauth: rows.filter((a) => a.needs_reauth).length,
      archived_mails: rows.reduce((n, a) => n + a.archived_mails, 0),
      archived_bytes: rows.reduce((n, a) => n + a.archived_bytes, 0),
      storage_quota_bytes: Number(user.storage_quota_bytes),
      jobs: { active: Number(jobs.active), failed_24h: Number(jobs.failed_24h) },
      unread_notifications: Number(unread.count),
    }
  })
  done()
}
