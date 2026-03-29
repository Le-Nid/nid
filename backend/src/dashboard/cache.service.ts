import { getRedis } from '../plugins/redis'

const DASHBOARD_TTL = 60 * 10 // 10 minutes

export async function getCachedStats(accountId: string): Promise<any | null> {
  const redis = getRedis()
  const cached = await redis.get(`dashboard:stats:${accountId}`)
  return cached ? JSON.parse(cached) : null
}

export async function setCachedStats(accountId: string, stats: any): Promise<void> {
  const redis = getRedis()
  await redis.set(
    `dashboard:stats:${accountId}`,
    JSON.stringify(stats),
    'EX',
    DASHBOARD_TTL
  )
}

export async function invalidateDashboardCache(accountId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(`dashboard:stats:${accountId}`)
}

export const ARCHIVE_STATS_TTL = 60 * 5 // 5 minutes

export async function getCachedArchiveStats(accountId: string): Promise<any | null> {
  const redis = getRedis()
  const cached = await redis.get(`dashboard:archive-stats:${accountId}`)
  return cached ? JSON.parse(cached) : null
}

export async function setCachedArchiveStats(accountId: string, stats: any): Promise<void> {
  const redis = getRedis()
  await redis.set(
    `dashboard:archive-stats:${accountId}`,
    JSON.stringify(stats),
    'EX',
    ARCHIVE_STATS_TTL
  )
}
