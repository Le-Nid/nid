import { FastifyInstance } from 'fastify'
import { generateWeeklyReport } from '../reports/report.service'

export async function reportsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // ─── Get current user's weekly report (on demand) ─────
  app.get('/weekly', auth, async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const report = await generateWeeklyReport(userId)
    if (!report) return reply.code(404).send({ error: 'No data' })
    return report
  })
}
