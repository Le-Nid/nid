import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

export default defineConfig({
  build: {
    target:            'node24',
    outDir:            'dist',
    lib: {
      entry:   'src/mcp-server.ts',
      formats: ['es'],
      fileName: () => 'mcp-server.js',
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
        /^zod\//,
        /^dotenv(\/.*)?$/,
        /^@aws-sdk\//,
        /^@modelcontextprotocol\//,
        'imapflow',
      ],
    },
    minify:       false,
    sourcemap:    true,
    emptyOutDir:  false,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
}) as any
