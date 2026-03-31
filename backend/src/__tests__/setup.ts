import { vi } from 'vitest'

// Mock config to avoid requiring env vars in tests
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

// Mock les modules qui chargent la config nécessitant DATABASE_URL et JWT secrets
vi.mock('../db', () => ({
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    deleteFrom: vi.fn(),
  },
  getDb: vi.fn(() => ({
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    deleteFrom: vi.fn(),
  })),
}))

vi.mock('../gmail/gmail.service', () => ({
  listMessages: vi.fn(),
  getProfile: vi.fn(),
  labelMessages: vi.fn(),
  archiveMessages: vi.fn(),
}))

vi.mock('../jobs/queue', () => ({
  enqueueJob: vi.fn(),
}))
