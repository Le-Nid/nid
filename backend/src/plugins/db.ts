import { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { config } from '../config'

let _sql: ReturnType<typeof postgres> | null = null

export async function connectDb(app: FastifyInstance) {
  const sql = postgres(config.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: (msg) => app.log.debug(msg),
  })

  // Test connection
  await sql`SELECT 1`
  app.log.info('✅ PostgreSQL connected')

  _sql = sql

  // Decorate Fastify instance
  app.decorate('db', sql)

  app.addHook('onClose', async () => {
    await sql.end()
    app.log.info('PostgreSQL disconnected')
  })
}

export function getDb() {
  if (!_sql) throw new Error('DB not initialized')
  return _sql
}
