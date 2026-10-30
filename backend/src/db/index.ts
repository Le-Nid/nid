import { Kysely, PostgresDialect } from 'kysely'
import { Migrator, type MigrationProvider, type Migration } from 'kysely/migration'
import pg from 'pg'
import { Database } from './types'
import { config } from '../config'
import * as migration001 from './migrations/001_full_schema'
import * as migration002 from './migrations/002_webhook_auth'
import * as migration003 from './migrations/003_archive_trash'
import * as migration004 from './migrations/004_gmail_labels'
import * as migration005 from './migrations/005_newsletter_scans'
import * as migration006 from './migrations/006_rule_templates'
import * as migration007 from './migrations/007_archive_body_text'
import * as migration008 from './migrations/008_account_backup_prefs'
import * as migration009 from './migrations/009_drop_pii_tracking'
import * as migration010 from './migrations/010_password_changed_at'
import * as migration011 from './migrations/011_passkeys'
import * as migration012 from './migrations/012_search_improvements'
import * as migration013 from './migrations/013_api_tokens'
import { createLogger } from '../logger'

const logger = createLogger('db')

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
  '001_full_schema': migration001,
  '002_webhook_auth': migration002,
  '003_archive_trash': migration003,
  '004_gmail_labels': migration004,
  '005_newsletter_scans': migration005,
  '006_rule_templates': migration006,
  '007_archive_body_text': migration007,
  '008_account_backup_prefs': migration008,
  '009_drop_pii_tracking': migration009,
  '010_password_changed_at': migration010,
  '011_passkeys': migration011,
  '012_search_improvements': migration012,
  '013_api_tokens': migration013,
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
      logger.info(`Migration "${result.migrationName}" exécutée`)
    } else if (result.status === 'Error') {
      logger.error(`Migration "${result.migrationName}" échouée`)
    }
  })

  if (error) {
    logger.error({ err: error }, 'Migration error')
    throw error
  }

  if (!results?.length) {
    logger.info('Base de données à jour (aucune migration à appliquer)')
  }
}

// ─── Teardown ─────────────────────────────────────────────

export async function closeDb(): Promise<void> {
  await db.destroy()
}
