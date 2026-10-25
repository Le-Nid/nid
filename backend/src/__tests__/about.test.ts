import { describe, it, expect, vi, beforeEach } from 'vitest'

const cfg = vi.hoisted(() => ({ APP_VERSION: '0.5.1', UPDATE_CHECK: true }))
vi.mock('../config', () => ({ config: cfg }))

const { compareVersions, fetchLatestVersion, checkForUpdate, getAbout } = await import('../about/about.service')

const registry = (tags: string[]) => vi.fn(async (url: string) => ({
  ok: true,
  json: async () => (url.includes('/token') ? { token: 't' } : { tags }),
}))

beforeEach(() => { cfg.APP_VERSION = '0.5.1' })

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.5.1', '0.5.1')).toBe(0)
    expect(compareVersions('0.5.1', '1.0.0')).toBe(-1)
    expect(compareVersions('dev', '0.5.1')).toBeNull()
  })
})

describe('update check', () => {
  it('takes the highest X.Y.Z tag, ignoring latest, main and sha tags', async () => {
    const fetchMock = registry(['latest', 'main', 'sha-abc', '0.9.0', '0.10.0', '0.2.3'])
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchLatestVersion()).toBe('0.10.0')
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer t' })
  })

  it('flags a newer published version', async () => {
    vi.stubGlobal('fetch', registry(['0.5.1', '0.6.0']))
    await checkForUpdate()
    expect(getAbout()).toMatchObject({ version: '0.5.1', latestVersion: '0.6.0', updateAvailable: true, checkFailed: false })
  })

  it('keeps the last known version when the registry is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    await checkForUpdate()
    expect(getAbout()).toMatchObject({ latestVersion: '0.6.0', updateAvailable: true, checkFailed: true })
  })

  it('never claims an update for a dev build', async () => {
    cfg.APP_VERSION = 'dev'
    vi.stubGlobal('fetch', registry(['9.9.9']))
    await checkForUpdate()
    expect(getAbout()).toMatchObject({ version: 'dev', latestVersion: '9.9.9', updateAvailable: false })
  })
})
