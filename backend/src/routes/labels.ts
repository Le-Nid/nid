import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getLabelsWithCounts, syncLabels } from '../labels/labels.service'
import { authPresets } from '../utils/auth'

const paramsSchema = z.object({ accountId: z.string().uuid() })

export async function labelsRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)
  // Validate before the ownership check, which queries the uuid column
  const opts = { ...accountAuth, preValidation: async (request: { params: unknown }) => { paramsSchema.parse(request.params) } }

  app.get('/:accountId', opts, async (request) => {
    const { accountId } = paramsSchema.parse(request.params)
    return getLabelsWithCounts(accountId)
  })

  app.post('/:accountId/sync', opts, async (request) => {
    const { accountId } = paramsSchema.parse(request.params)
    return syncLabels(accountId)
  })
}
