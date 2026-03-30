import { getDb } from '../db'
import { sql } from 'kysely'

export interface WeeklyReport {
  userId: string
  email: string
  period: { from: Date; to: Date }
  stats: {
    jobsCompleted: number
    jobsFailed: number
    mailsArchived: number
    archiveSizeBytes: number
    rulesExecuted: number
    topSenders: { sender: string; count: number }[]
  }
}

export async function generateWeeklyReport(userId: string): Promise<WeeklyReport | null> {
  const db = getDb()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)

  const user = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('id', '=', userId)
    .where('is_active', '=', true)
    .executeTakeFirst()

  if (!user) return null

  // Jobs stats this week
  const jobStats = await db
    .selectFrom('jobs')
    .select((eb) => [
      eb.fn.countAll<number>().as('total'),
      sql<number>`count(*) filter (where status = 'completed')`.as('completed'),
      sql<number>`count(*) filter (where status = 'failed')`.as('failed'),
    ])
    .where('user_id', '=', userId)
    .where('created_at', '>=', weekAgo)
    .executeTakeFirstOrThrow()

  // Get user's gmail accounts
  const accounts = await db
    .selectFrom('gmail_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .execute()

  const accountIds = accounts.map((a) => a.id)

  let mailsArchived = 0
  let archiveSizeBytes = 0
  let topSenders: { sender: string; count: number }[] = []

  if (accountIds.length > 0) {
    // Mails archived this week
    const archiveStats = await db
      .selectFrom('archived_mails')
      .select((eb) => [
        eb.fn.countAll<number>().as('count'),
        eb.fn.sum<number>('size_bytes').as('total_size'),
      ])
      .where('gmail_account_id', 'in', accountIds)
      .where('archived_at', '>=', weekAgo)
      .executeTakeFirstOrThrow()

    mailsArchived = Number(archiveStats.count ?? 0)
    archiveSizeBytes = Number(archiveStats.total_size ?? 0)

    // Top senders in archives this week
    topSenders = await db
      .selectFrom('archived_mails')
      .select((eb) => [
        'sender',
        eb.fn.countAll<number>().as('count'),
      ])
      .where('gmail_account_id', 'in', accountIds)
      .where('archived_at', '>=', weekAgo)
      .where('sender', 'is not', null)
      .groupBy('sender')
      .orderBy('count', 'desc')
      .limit(10)
      .execute() as any
  }

  // Rules executed this week
  const rulesExecuted = await db
    .selectFrom('jobs')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('user_id', '=', userId)
    .where('type', '=', 'run_rule')
    .where('created_at', '>=', weekAgo)
    .executeTakeFirstOrThrow()

  return {
    userId: user.id,
    email: user.email,
    period: { from: weekAgo, to: now },
    stats: {
      jobsCompleted: Number(jobStats.completed ?? 0),
      jobsFailed: Number(jobStats.failed ?? 0),
      mailsArchived,
      archiveSizeBytes,
      rulesExecuted: Number(rulesExecuted.count ?? 0),
      topSenders,
    },
  }
}

export async function generateAllReports(): Promise<WeeklyReport[]> {
  const db = getDb()
  const users = await db
    .selectFrom('users')
    .select('id')
    .where('is_active', '=', true)
    .execute()

  const reports: WeeklyReport[] = []
  for (const user of users) {
    const report = await generateWeeklyReport(user.id)
    if (report) reports.push(report)
  }
  return reports
}
