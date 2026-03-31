import { FastifyInstance } from 'fastify'
import { generateWeeklyReport } from '../reports/report.service'
import { notFound } from '../utils/db'
import { authPresets } from '../utils/auth'

export async function reportsRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)

  // ─── Get current user's weekly report (on demand) ─────
  app.get('/weekly', auth, async (request, reply) => {
    const userId = request.user.sub
    const report = await generateWeeklyReport(userId)
    if (!report) return notFound(reply, 'No data')
    return report
  })
}
