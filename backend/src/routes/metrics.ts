import { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { config } from '../config'
import { registry, httpDuration, renderMetrics } from '../metrics/metrics.service'

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Called on the root instance (not app.register): the onResponse hook must see every route.
 * Prometheus scrape endpoint, off unless METRICS_TOKEN is set (nginx exposes /api publicly).
 * Prometheus sends it as `authorization: { credentials: <token> }` (Bearer).
 */
export async function registerMetrics(app: FastifyInstance) {
  app.addHook('onResponse', async (request, reply) => {
    httpDuration.observe(
      { method: request.method, route: request.routeOptions.url ?? 'unmatched', status_code: reply.statusCode },
      reply.elapsedTime / 1000,
    )
  })

  if (!config.METRICS_TOKEN) return

  app.get('/api/metrics', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
    if (!sameToken(token, config.METRICS_TOKEN)) return reply.code(401).send({ error: 'Unauthorized' })
    return reply.type(registry.contentType).send(await renderMetrics())
  })
}
