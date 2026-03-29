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
})
