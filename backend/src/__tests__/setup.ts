import { vi } from 'vitest'

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
