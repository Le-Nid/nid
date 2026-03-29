import { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { config } from '../config'

let _redis: Redis | null = null

export async function connectRedis(app: FastifyInstance) {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    lazyConnect: true,
  })

  await redis.connect()
  await redis.ping()
  app.log.info('✅ Redis connected')

  _redis = redis
  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
    app.log.info('Redis disconnected')
  })
}

export function getRedis(): Redis {
  if (!_redis) throw new Error('Redis not initialized')
  return _redis
}
