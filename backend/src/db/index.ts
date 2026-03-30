import { Kysely, PostgresDialect, Migrator, MigrationProvider, Migration } from 'kysely'
import pg from 'pg'
import { Database } from './types'
import { config } from '../config'
import * as migration001 from './migrations/001_initial'
import * as migration003 from './migrations/003_multiuser'
import * as migration004 from './migrations/004_notifications'
import * as migration005 from './migrations/005_audit_logs'
import * as migration006 from './migrations/006_totp'

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
  '001_initial':       migration001,
  '003_multiuser':     migration003,
  '004_notifications': migration004,
  '005_audit_logs':    migration005,
  '006_totp':          migration006,
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
