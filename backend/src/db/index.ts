import { Kysely, PostgresDialect, Migrator, MigrationProvider, Migration } from 'kysely'
import pg from 'pg'
import { Database } from './types'
import { config } from '../config'
import * as migration001 from './migrations/001_initial_full'
import * as migration004 from './migrations/004_analytics'

// ─── Kysely instance ──────────────────────────────────────

const dialect = new PostgresDialect({
  pool: new pg.Pool({
    connectionString: config.DATABASE_URL,
    max:             10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  }),
})

export const db = new Kysely<Database>({ dialect })

export function getDb(): Kysely<Database> {
  return db
}

// ─── Migration provider (in-code, pas de filesystem) ──────

const migrations: Record<string, Migration> = {
  '001_initial_full': migration001,
  '004_analytics': migration004,
}

class InCodeMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations
  }
}

// ─── Runner — appelé au démarrage ─────────────────────────

export async function runMigrations(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new InCodeMigrationProvider(),
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.info(`✅ Migration "${result.migrationName}" exécutée`)
    } else if (result.status === 'Error') {
      console.error(`❌ Migration "${result.migrationName}" échouée`)
    }
  })

  if (error) {
    console.error('Migration error:', error)
    throw error
  }

  if (!results?.length) {
    console.info('✅ Base de données à jour (aucune migration à appliquer)')
  }
}

// ─── Teardown ─────────────────────────────────────────────

export async function closeDb(): Promise<void> {
  await db.destroy()
}
