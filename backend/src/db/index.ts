import { Kysely, PostgresDialect, Migrator, MigrationProvider, Migration } from 'kysely'
import pg from 'pg'
import { Database } from './types'
import { config } from '../config'
import * as migration001 from './migrations/001_initial_full'
import * as migration004 from './migrations/004_analytics'
import * as migration005 from './migrations/005_social_accounts'
import * as migration006 from './migrations/006_attachment_search'
import * as migration007 from './migrations/007_saved_searches'
import * as migration008 from './migrations/008_ops_resilience'
import * as migration009 from './migrations/009_expiration_sharing'
import * as migration010 from './migrations/010_attachment_dedup'

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
  '005_social_accounts': migration005,
  '006_attachment_search': migration006,
  '007_saved_searches': migration007,
  '008_ops_resilience': migration008,
  '009_expiration_sharing': migration009,
  '010_attachment_dedup': migration010,
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
