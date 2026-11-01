import { defineConfig } from 'vitest/config'

// Real services, no mocks (no setup.ts): PostgreSQL and a Dovecot IMAP server, started by CI (job backend-imap)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__integration__/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
