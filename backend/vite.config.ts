import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

export default defineConfig({
  build: {
    target:            'node24',
    outDir:            'dist',
    lib: {
      // pdf-worker: its own file, loaded by new Worker() (archive/attachment-text.ts)
      entry:   { index: 'src/index.ts', 'pdf-worker': 'src/archive/pdf-worker.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
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
        /^kysely(\/.*)?$/,
        'pg',
        'bcrypt',
        'mailparser',
        'archiver',
        'pino',
        'pino-pretty',
        'zod',
        /^dotenv(\/.*)?$/,
        /^zod\//,
        'imapflow',
        'qrcode',
        'prom-client',
        'nodemailer',
        /^@simplewebauthn\//,
        'unpdf',
        'fflate',
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
