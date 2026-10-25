import { config } from '../config'
import { createLogger } from '../logger'

const logger = createLogger('update-check')

const IMAGE = 'le-nid/nid'
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000   // twice a day
const FIRST_CHECK_DELAY_MS = 60 * 1000          // let the app start first
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

// shortcut: kept in memory (one backend process); a restart re-checks after FIRST_CHECK_DELAY_MS
let lastCheck: { latestVersion: string | null; checkedAt: string; error?: boolean } | null = null

/** -1 / 0 / 1 for two X.Y.Z versions; null when one is not plain semver (e.g. « dev »). */
export function compareVersions(a: string, b: string): number | null {
  const [pa, pb] = [SEMVER.exec(a), SEMVER.exec(b)]
  if (!pa || !pb) return null
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

/** Highest X.Y.Z tag of the published image (anonymous ghcr.io token: nothing about this instance is sent). */
export async function fetchLatestVersion(): Promise<string | null> {
  const signal = AbortSignal.timeout(10_000)
  const tokenRes = await fetch(`https://ghcr.io/token?scope=repository:${IMAGE}:pull`, { signal })
  if (!tokenRes.ok) throw new Error(`ghcr token: HTTP ${tokenRes.status}`)
  const { token } = await tokenRes.json() as { token: string }
  const tagsRes = await fetch(`https://ghcr.io/v2/${IMAGE}/tags/list`, { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!tagsRes.ok) throw new Error(`ghcr tags: HTTP ${tagsRes.status}`)
  const { tags = [] } = await tagsRes.json() as { tags?: string[] }
  return tags.filter((t) => SEMVER.test(t)).sort((a, b) => compareVersions(a, b)!).at(-1) ?? null
}

export async function checkForUpdate(): Promise<void> {
  try {
    lastCheck = { latestVersion: await fetchLatestVersion(), checkedAt: new Date().toISOString() }
    if (compareVersions(lastCheck.latestVersion ?? '', config.APP_VERSION) === 1) {
      logger.info({ current: config.APP_VERSION, latest: lastCheck.latestVersion }, 'a newer Nid version is available')
    }
  } catch (err) {
    // A failed check keeps the last known latest version; the next one comes in 12 hours
    lastCheck = { latestVersion: lastCheck?.latestVersion ?? null, checkedAt: new Date().toISOString(), error: true }
    logger.warn({ err }, 'update check failed')
  }
}

export function getAbout() {
  const latestVersion = lastCheck?.latestVersion ?? null
  return {
    version: config.APP_VERSION,
    updateCheck: config.UPDATE_CHECK,
    latestVersion,
    updateAvailable: !!latestVersion && compareVersions(latestVersion, config.APP_VERSION) === 1,
    checkedAt: lastCheck?.checkedAt ?? null,
    checkFailed: !!lastCheck?.error,
  }
}

export function startUpdateChecker(): void {
  if (!config.UPDATE_CHECK) {
    logger.info('update check disabled (UPDATE_CHECK=false)')
    return
  }
  setTimeout(() => void checkForUpdate(), FIRST_CHECK_DELAY_MS).unref()
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS).unref()
}
