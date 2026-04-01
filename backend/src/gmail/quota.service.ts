import { getDb } from '../db'
import { sql } from 'kysely'

/** Well-known Gmail API endpoint quota costs */
const QUOTA_COSTS: Record<string, number> = {
  'messages.get': 5,
  'messages.list': 5,
  'messages.send': 100,
  'messages.modify': 5,
  'messages.trash': 5,
  'messages.delete': 10,
  'messages.batchModify': 50,
  'messages.batchDelete': 50,
  'messages.insert': 25,
  'labels.list': 1,
  'labels.get': 1,
  'labels.create': 5,
  'drafts.list': 5,
  'drafts.get': 5,
  'threads.list': 5,
  'threads.get': 10,
  'history.list': 2,
  'users.getProfile': 5,
}

/**
 * Record a Gmail API call for quota tracking.
 */
export async function trackApiCall(accountId: string, endpoint: string): Promise<void> {
  const units = QUOTA_COSTS[endpoint] ?? 5
  const db = getDb()
  await db
    .insertInto('gmail_api_usage')
    .values({
      gmail_account_id: accountId,
      endpoint,
      quota_units: units,
    })
    .execute()
}

/**
 * Get quota usage stats for an account.
 */
export async function getQuotaStats(accountId: string) {
  const db = getDb()

  // Usage in last minute (for rate display)
  const lastMinute = new Date(Date.now() - 60_000)
  const perMinuteResult = await db
    .selectFrom('gmail_api_usage')
    .select((eb) => eb.fn.sum<number>('quota_units').as('total'))
    .select((eb) => eb.fn.count<number>('id').as('calls'))
    .where('gmail_account_id', '=', accountId)
    .where('recorded_at', '>=', lastMinute)
    .executeTakeFirst()

  // Usage in last hour
  const lastHour = new Date(Date.now() - 3_600_000)
  const perHourResult = await db
    .selectFrom('gmail_api_usage')
    .select((eb) => eb.fn.sum<number>('quota_units').as('total'))
    .select((eb) => eb.fn.count<number>('id').as('calls'))
    .where('gmail_account_id', '=', accountId)
    .where('recorded_at', '>=', lastHour)
    .executeTakeFirst()

  // Usage in last 24h
  const last24h = new Date(Date.now() - 86_400_000)
  const perDayResult = await db
    .selectFrom('gmail_api_usage')
    .select((eb) => eb.fn.sum<number>('quota_units').as('total'))
    .select((eb) => eb.fn.count<number>('id').as('calls'))
    .where('gmail_account_id', '=', accountId)
    .where('recorded_at', '>=', last24h)
    .executeTakeFirst()

  // Top endpoints in last 24h
  const topEndpoints = await db
    .selectFrom('gmail_api_usage')
    .select('endpoint')
    .select((eb) => eb.fn.sum<number>('quota_units').as('total_units'))
    .select((eb) => eb.fn.count<number>('id').as('calls'))
    .where('gmail_account_id', '=', accountId)
    .where('recorded_at', '>=', last24h)
    .groupBy('endpoint')
    .orderBy('total_units', 'desc')
    .limit(10)
    .execute()

  // Hourly breakdown for last 24h
  const hourlyBreakdown = await sql<{ hour: string; units: number; calls: number }>`
    SELECT
      date_trunc('hour', recorded_at) AS hour,
      COALESCE(SUM(quota_units), 0)::int AS units,
      COUNT(*)::int AS calls
    FROM gmail_api_usage
    WHERE gmail_account_id = ${accountId}
      AND recorded_at >= ${last24h}
    GROUP BY date_trunc('hour', recorded_at)
    ORDER BY hour
  `.execute(db)

  const QUOTA_LIMIT_PER_SEC = 250

  return {
    limits: {
      perSecond: QUOTA_LIMIT_PER_SEC,
      perMinute: QUOTA_LIMIT_PER_SEC * 60,
    },
    usage: {
      lastMinute: {
        units: Number(perMinuteResult?.total ?? 0),
        calls: Number(perMinuteResult?.calls ?? 0),
        percentOfLimit: Math.round((Number(perMinuteResult?.total ?? 0) / (QUOTA_LIMIT_PER_SEC * 60)) * 100),
      },
      lastHour: {
        units: Number(perHourResult?.total ?? 0),
        calls: Number(perHourResult?.calls ?? 0),
      },
      last24h: {
        units: Number(perDayResult?.total ?? 0),
        calls: Number(perDayResult?.calls ?? 0),
      },
    },
    topEndpoints: topEndpoints.map((e) => ({
      endpoint: e.endpoint,
      units: Number(e.total_units),
      calls: Number(e.calls),
    })),
    hourlyBreakdown: hourlyBreakdown.rows.map((r) => ({
      hour: r.hour,
      units: Number(r.units),
      calls: Number(r.calls),
    })),
  }
}

/**
 * Cleanup old usage data (keep only last 30 days).
 */
export async function cleanupOldUsageData(): Promise<number> {
  const db = getDb()
  const cutoff = new Date(Date.now() - 30 * 86_400_000)
  const result = await db
    .deleteFrom('gmail_api_usage')
    .where('recorded_at', '<', cutoff)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0)
}
