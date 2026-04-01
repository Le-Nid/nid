import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

export default defineConfig({
  build: {
    target:            'node24',
    outDir:            'dist',
    lib: {
      entry:   'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        /^@fastify\//,
        /^fastify/,
        'googleapis',
        'bullmq',
        'ioredis',
        'kysely',
        'pg',
        'bcrypt',
        'mailparser',
        'nodemailer',
        'archiver',
        'pino',
        'pino-pretty',
        'zod',
        /^dotenv(\/.*)?$/,
        /^@aws-sdk\//,
        /^@modelcontextprotocol\//,
        /^zod\//,
        'imapflow',
      ],
    },
    // Pas de minification pour un serveur Node (debug plus facile + pas de gain réel)
    minify:       false,
    sourcemap:    true,
    emptyOutDir:  true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },

  // Vitest configuration
  test: {
    globals:     true,
    environment: 'node',
    setupFiles:  ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['dist/**', 'src/__tests__/**', 'src/db/types.ts', 'src/db/migrations/**'],
    },
    include:  ['src/__tests__/**/*.test.ts'],
    testTimeout: 10_000,
  },
}) as any
