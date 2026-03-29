import { defineConfig } from 'vite'
import { builtinModules } from 'module'

export default defineConfig({
  build: {
    target:            'node24',
    outDir:            'dist',
    lib: {
      entry:   'src/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
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
        'dotenv',
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
      exclude: ['dist/**', 'src/__tests__/**'],
    },
    include:  ['src/__tests__/**/*.test.ts'],
    testTimeout: 10_000,
  },
}) as any
