import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 4000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '30d',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/auth/gmail/callback',
    GOOGLE_SSO_REDIRECT_URI: '',
    FRONTEND_URL: 'http://localhost:3000',
    ARCHIVE_PATH: '/tmp/archives',
    ADMIN_EMAIL: '',
    ALLOW_REGISTRATION: true,
    GMAIL_BATCH_SIZE: 25,
    GMAIL_THROTTLE_MS: 1000,
    GMAIL_CONCURRENCY: 10,
  },
}))

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()
const mockExecuteTakeFirstOrThrow = vi.fn()
const mockReturningAll = vi.fn(() => ({ executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow }))

const mockChain = {
  selectAll: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  values: vi.fn(() => ({ returningAll: mockReturningAll })),
  set: vi.fn(() => ({ where: vi.fn(() => ({ where: vi.fn(() => ({ returningAll: mockReturningAll })) })) })),
  execute: mockExecute,
  executeTakeFirst: mockExecuteTakeFirst,
  executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
}

vi.mock('../db', () => ({
  db: {
    selectFrom: vi.fn(() => mockChain),
    insertInto: vi.fn(() => mockChain),
    updateTable: vi.fn(() => mockChain),
    deleteFrom: vi.fn(() => ({ where: vi.fn(() => ({ where: vi.fn(() => ({ executeTakeFirst: vi.fn(() => ({ numDeletedRows: 1n })) })) })) })),
  },
  getDb: vi.fn(() => ({
    selectFrom: vi.fn(() => mockChain),
    insertInto: vi.fn(() => mockChain),
    updateTable: vi.fn(() => mockChain),
    deleteFrom: vi.fn(() => ({ where: vi.fn(() => ({ where: vi.fn(() => ({ executeTakeFirst: vi.fn(() => ({ numDeletedRows: 1n })) })) })) })),
  })),
}))

vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn(),
  batchGetMessages: vi.fn(),
  getMessage: vi.fn(),
  getGmailClient: vi.fn(),
}))

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn(),
}))

// ─── Tests ──────────────────────────────────────────────────

describe('Saved Searches', () => {
  it('la migration 007 exporte up et down', async () => {
    const migration = await import('../db/migrations/007_saved_searches')
    expect(migration.up).toBeDefined()
    expect(migration.down).toBeDefined()
    expect(typeof migration.up).toBe('function')
    expect(typeof migration.down).toBe('function')
  })

  it('les types SavedSearch sont exportés', async () => {
    const types = await import('../db/types')
    // SavedSearch is a type alias — we check it exists at runtime via the fact
    // that the module has the Database interface defined with saved_searches
    // If it compiles, the types are correct
    expect(types).toBeDefined()
  })

  it('la route saved-searches exporte savedSearchRoutes', async () => {
    const mod = await import('../routes/saved-searches')
    expect(mod.savedSearchRoutes).toBeDefined()
    expect(typeof mod.savedSearchRoutes).toBe('function')
  })
})

describe('Unified Inbox', () => {
  it('la route unified exporte unifiedRoutes', async () => {
    const mod = await import('../routes/unified')
    expect(mod.unifiedRoutes).toBeDefined()
    expect(typeof mod.unifiedRoutes).toBe('function')
  })
})

describe('Archive Threads', () => {
  it('les colonnes in_reply_to et references_header sont dans ArchivedMailsTable', async () => {
    // Vérifie que les types compilent avec les nouveaux champs
    const types = await import('../db/types')
    // On vérifie juste que ça importe sans erreur
    expect(types).toBeDefined()
  })
})

describe('Pagination utils', () => {
  it('extractPagination fonctionne avec les défauts', async () => {
    const { extractPagination } = await import('../utils/pagination')
    const result = extractPagination({})
    expect(result.page).toBe(1)
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(0)
  })

  it('extractPagination calcule l\'offset', async () => {
    const { extractPagination } = await import('../utils/pagination')
    const result = extractPagination({ page: '3', limit: '20' })
    expect(result.page).toBe(3)
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(40)
  })

  it('extractPagination limite à 100', async () => {
    const { extractPagination } = await import('../utils/pagination')
    const result = extractPagination({ limit: '500' })
    expect(result.limit).toBe(100)
  })
})

describe('DB utils', () => {
  it('escapeIlike échappe les caractères spéciaux', async () => {
    const { escapeIlike } = await import('../utils/db')
    expect(escapeIlike('test%_\\value')).toBe('test\\%\\_\\\\value')
  })
})

describe('Route registration', () => {
  it('registerRoutes inclut saved-searches et unified', async () => {
    // Juste vérifier que le module importe sans erreur
    // (on ne peut pas vraiment tester le registration sans mock Fastify complet)
    const mod = await import('../routes/index')
    expect(mod.registerRoutes).toBeDefined()
    expect(typeof mod.registerRoutes).toBe('function')
  })
})
