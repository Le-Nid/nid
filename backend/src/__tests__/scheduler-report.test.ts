import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ─────────────────────────────────────
vi.mock('../db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn(),
}))

vi.mock('../analytics/analytics.service', () => ({
  recordInboxSnapshot: vi.fn(),
}))

// We test shouldRun logic directly since it's not exported.
// Instead, test the scheduler scheduling logic.

describe('scheduler shouldRun logic', () => {
  // Reimplementing the shouldRun function from scheduler.ts for testing
  function shouldRun(schedule: string, lastRunAt: Date | null, now: Date): boolean {
    if (!lastRunAt) return true
    const diffMs = now.getTime() - new Date(lastRunAt).getTime()
    const diffH = diffMs / 1000 / 3600
    switch (schedule) {
      case 'hourly': return diffH >= 1
      case 'daily': return diffH >= 24
      case 'weekly': return diffH >= 24 * 7
      case 'monthly': return diffH >= 24 * 30
      default: return false
    }
  }

  it('returns true when never run', () => {
    expect(shouldRun('daily', null, new Date())).toBe(true)
  })

  it('hourly: returns true after 1 hour', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000)
    expect(shouldRun('hourly', twoHoursAgo, now)).toBe(true)
  })

  it('hourly: returns false within 1 hour', () => {
    const now = new Date()
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000)
    expect(shouldRun('hourly', thirtyMinAgo, now)).toBe(false)
  })

  it('daily: returns true after 24 hours', () => {
    const now = new Date()
    const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000)
    expect(shouldRun('daily', twoDaysAgo, now)).toBe(true)
  })

  it('daily: returns false within 24 hours', () => {
    const now = new Date()
    const tenHoursAgo = new Date(now.getTime() - 10 * 3600 * 1000)
    expect(shouldRun('daily', tenHoursAgo, now)).toBe(false)
  })

  it('weekly: returns true after 7 days', () => {
    const now = new Date()
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 3600 * 1000)
    expect(shouldRun('weekly', eightDaysAgo, now)).toBe(true)
  })

  it('weekly: returns false within 7 days', () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000)
    expect(shouldRun('weekly', threeDaysAgo, now)).toBe(false)
  })

  it('monthly: returns true after 30 days', () => {
    const now = new Date()
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 3600 * 1000)
    expect(shouldRun('monthly', thirtyOneDaysAgo, now)).toBe(true)
  })

  it('monthly: returns false within 30 days', () => {
    const now = new Date()
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3600 * 1000)
    expect(shouldRun('monthly', tenDaysAgo, now)).toBe(false)
  })

  it('unknown schedule returns false', () => {
    const now = new Date()
    expect(shouldRun('0 3 * * *', new Date(0), now)).toBe(false)
  })
})

describe('report scheduler formatReportBody logic', () => {
  // Reimplemented from report.scheduler.ts
  function formatReportBody(stats: {
    jobsCompleted: number
    jobsFailed: number
    mailsArchived: number
    archiveSizeBytes: number
    rulesExecuted: number
  }): string {
    const parts: string[] = []
    if (stats.jobsCompleted > 0) parts.push(`${stats.jobsCompleted} jobs terminés`)
    if (stats.jobsFailed > 0) parts.push(`${stats.jobsFailed} jobs en erreur`)
    if (stats.mailsArchived > 0) {
      const sizeMB = (stats.archiveSizeBytes / 1024 / 1024).toFixed(1)
      parts.push(`${stats.mailsArchived} mails archivés (${sizeMB} Mo)`)
    }
    if (stats.rulesExecuted > 0) parts.push(`${stats.rulesExecuted} règles exécutées`)
    return parts.length > 0 ? parts.join(' · ') : 'Aucune activité cette semaine'
  }

  it('formats non-empty report', () => {
    const result = formatReportBody({
      jobsCompleted: 5,
      jobsFailed: 1,
      mailsArchived: 100,
      archiveSizeBytes: 50 * 1024 * 1024,
      rulesExecuted: 3,
    })
    expect(result).toContain('5 jobs terminés')
    expect(result).toContain('1 jobs en erreur')
    expect(result).toContain('100 mails archivés')
    expect(result).toContain('50.0 Mo')
    expect(result).toContain('3 règles exécutées')
  })

  it('formats empty report', () => {
    const result = formatReportBody({
      jobsCompleted: 0,
      jobsFailed: 0,
      mailsArchived: 0,
      archiveSizeBytes: 0,
      rulesExecuted: 0,
    })
    expect(result).toBe('Aucune activité cette semaine')
  })

  it('formats partial report', () => {
    const result = formatReportBody({
      jobsCompleted: 3,
      jobsFailed: 0,
      mailsArchived: 0,
      archiveSizeBytes: 0,
      rulesExecuted: 2,
    })
    expect(result).toContain('3 jobs terminés')
    expect(result).toContain('2 règles exécutées')
    expect(result).not.toContain('erreur')
    expect(result).not.toContain('archivés')
  })
})
