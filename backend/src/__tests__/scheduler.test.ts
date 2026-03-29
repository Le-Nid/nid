import { describe, it, expect } from 'vitest'

// On extrait la logique pure pour la tester sans démarrer le scheduler
function shouldRun(schedule: string, lastRunAt: Date | null, now: Date): boolean {
  const validSchedules = ['hourly', 'daily', 'weekly', 'monthly']
  if (!validSchedules.includes(schedule)) return false
  if (!lastRunAt) return true
  const diffMs = now.getTime() - new Date(lastRunAt).getTime()
  const diffH  = diffMs / 1000 / 3600
  switch (schedule) {
    case 'hourly':  return diffH >= 1
    case 'daily':   return diffH >= 24
    case 'weekly':  return diffH >= 24 * 7
    case 'monthly': return diffH >= 24 * 30
    default:        return false
  }
}

const now = new Date('2025-01-15T12:00:00Z')

describe('shouldRun', () => {
  it('exécute si jamais lancée (lastRunAt null)', () => {
    expect(shouldRun('daily', null, now)).toBe(true)
  })

  it('exécute daily si > 24h écoulées', () => {
    const last = new Date('2025-01-14T10:00:00Z') // 26h avant
    expect(shouldRun('daily', last, now)).toBe(true)
  })

  it("n'exécute pas daily si < 24h écoulées", () => {
    const last = new Date('2025-01-15T06:00:00Z') // 6h avant
    expect(shouldRun('daily', last, now)).toBe(false)
  })

  it('exécute weekly si > 7 jours', () => {
    const last = new Date('2025-01-07T12:00:00Z') // 8j avant
    expect(shouldRun('weekly', last, now)).toBe(true)
  })

  it('exécute hourly si > 1h', () => {
    const last = new Date('2025-01-15T10:30:00Z') // 1.5h avant
    expect(shouldRun('hourly', last, now)).toBe(true)
  })

  it("n'exécute pas pour schedule cron inconnu", () => {
    expect(shouldRun('0 2 * * *', null, now)).toBe(false)
  })
})
