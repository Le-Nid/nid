import { generateAllReports, WeeklyReport } from './report.service'
import { notify } from '../notifications/notify'
import pino from 'pino'

const logger = pino({ name: 'report-scheduler' })

// Report scheduler — runs once per day, generates weekly reports on Mondays
// Stores reports as in-app notifications

export function startReportScheduler() {
  const INTERVAL_MS = 60 * 60 * 1000  // toutes les heures

  let lastRunDate: string | null = null

  async function tick() {
    const now = new Date()
    const dayOfWeek = now.getDay()  // 0=Sunday, 1=Monday
    const today = now.toISOString().slice(0, 10)

    // Only run on Mondays, and only once per day
    if (dayOfWeek !== 1 || lastRunDate === today) return

    try {
      logger.info('Generating weekly reports...')
      const reports = await generateAllReports()

      for (const report of reports) {
        await notify({
          userId: report.userId,
          category: 'weekly_report',
          title: 'Rapport hebdomadaire',
          body: formatReportBody(report),
          data: report.stats as Record<string, unknown>,
        })
      }

      lastRunDate = today
      logger.info(`${reports.length} reports generated`)
    } catch (err) {
      logger.error({ err }, 'Report generation error')
    }
  }

  setInterval(tick, INTERVAL_MS)
  logger.info('Report scheduler started (hourly check, runs Mondays)')
}

function formatReportBody(report: WeeklyReport): string {
  const { stats } = report
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
