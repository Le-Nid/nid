import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test scheduler tick tasks (re-implemented logic for testability) ───

// Reimplementation of the trash purge scheduling logic from scheduler.ts
function shouldPurgeTrash(
  lastPurge: Date | null,
  now: Date,
): boolean {
  if (!lastPurge || (now.getTime() - lastPurge.getTime()) > 24 * 3600 * 1000) {
    return now.getHours() === 4
  }
  return false
}

function shouldCheckIntegrity(
  lastCheck: Date | null,
  now: Date,
): boolean {
  if (!lastCheck || (now.getTime() - lastCheck.getTime()) > 24 * 3600 * 1000) {
    return now.getHours() === 3
  }
  return false
}

/** Build a Date where getHours() returns the desired local hour */
function dateAtLocalHour(hour: number): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d
}

function shouldSnapshot(
  lastSnapshot: Date | null,
  now: Date,
): boolean {
  return !lastSnapshot || (now.getTime() - lastSnapshot.getTime()) > 6 * 3600 * 1000
}

function shouldCheckExpiration(
  lastCheck: Date | null,
  now: Date,
): boolean {
  return !lastCheck || (now.getTime() - lastCheck.getTime()) > 15 * 60 * 1000
}

function shouldCleanShares(
  lastCleanup: Date | null,
  now: Date,
): boolean {
  return !lastCleanup || (now.getTime() - lastCleanup.getTime()) > 3600 * 1000
}

describe('scheduler — trash purge scheduling', () => {
  it('purges at 4 AM when never purged', () => {
    const at4am = dateAtLocalHour(4)
    expect(shouldPurgeTrash(null, at4am)).toBe(true)
  })

  it('does not purge at other hours', () => {
    const at10am = dateAtLocalHour(10)
    expect(shouldPurgeTrash(null, at10am)).toBe(false)
  })

  it('does not purge if last purge < 24h ago', () => {
    const now = dateAtLocalHour(4)
    const last = new Date(now.getTime() - 18 * 3600 * 1000)
    expect(shouldPurgeTrash(last, now)).toBe(false)
  })

  it('purges if last purge > 24h ago and it is 4 AM', () => {
    const now = dateAtLocalHour(4)
    const last = new Date(now.getTime() - 48 * 3600 * 1000)
    expect(shouldPurgeTrash(last, now)).toBe(true)
  })
})

describe('scheduler — integrity check scheduling', () => {
  it('checks at 3 AM when never checked', () => {
    const at3am = dateAtLocalHour(3)
    expect(shouldCheckIntegrity(null, at3am)).toBe(true)
  })

  it('does not check at other hours', () => {
    const at10am = dateAtLocalHour(10)
    expect(shouldCheckIntegrity(null, at10am)).toBe(false)
  })
})

describe('scheduler — inbox snapshot scheduling', () => {
  it('snapshots when never done', () => {
    expect(shouldSnapshot(null, new Date())).toBe(true)
  })

  it('snapshots after 6h', () => {
    const now = new Date()
    const sevenHoursAgo = new Date(now.getTime() - 7 * 3600 * 1000)
    expect(shouldSnapshot(sevenHoursAgo, now)).toBe(true)
  })

  it('does not snapshot within 6h', () => {
    const now = new Date()
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000)
    expect(shouldSnapshot(threeHoursAgo, now)).toBe(false)
  })
})

describe('scheduler — expiration check scheduling', () => {
  it('checks when never checked', () => {
    expect(shouldCheckExpiration(null, new Date())).toBe(true)
  })

  it('checks after 15 min', () => {
    const now = new Date()
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000)
    expect(shouldCheckExpiration(twentyMinAgo, now)).toBe(true)
  })

  it('does not check within 15 min', () => {
    const now = new Date()
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
    expect(shouldCheckExpiration(tenMinAgo, now)).toBe(false)
  })
})

describe('scheduler — share cleanup scheduling', () => {
  it('cleans when never done', () => {
    expect(shouldCleanShares(null, new Date())).toBe(true)
  })

  it('cleans after 1h', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000)
    expect(shouldCleanShares(twoHoursAgo, now)).toBe(true)
  })
})
