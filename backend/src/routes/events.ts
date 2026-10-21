import { FastifyInstance } from 'fastify'
import { getCounters, sseFrame, subscribeUser } from '../events/events.service'

export const EVENTS_HEARTBEAT_MS = 30_000

/** GET /api/events — the signed-in user's live stream (B3): `counters` on connect and on change, `job` started/finished. */
export async function eventsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const raw = reply.raw
    const send = (frame: string) => { if (!raw.destroyed) raw.write(frame) }

    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: no buffering
    })

    // Subscribe before the first read so no change published in between is lost
    const unsubscribe = await subscribeUser(userId, send)
    const heartbeat = setInterval(() => send(': heartbeat\n\n'), EVENTS_HEARTBEAT_MS)
    raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe().catch((err) => request.log.warn({ err }, 'events: unsubscribe failed'))
    })

    send(sseFrame('counters', await getCounters(userId)))
    return reply
  })
}
