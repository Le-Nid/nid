import { FastifyInstance } from 'fastify'
import { db, runMigrations, closeDb } from '../db'

export async function connectDb(app: FastifyInstance): Promise<void> {
  // 1. Exécuter les migrations avant tout
  app.log.info('Running database migrations…')
  await runMigrations()

  // 2. Test de connexion
  await db.selectFrom('users').select('id').limit(1).execute()
  app.log.info('✅ PostgreSQL (Kysely) connected')

  // 3. Décorer l'instance Fastify
  app.decorate('db', db)

  // 4. Fermer proprement à l'arrêt
  app.addHook('onClose', async () => {
    await closeDb()
    app.log.info('PostgreSQL disconnected')
  })
}
