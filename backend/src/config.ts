import 'dotenv/config'

function require_env(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',

  DATABASE_URL: require_env('DATABASE_URL'),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://redis:6379',

  JWT_SECRET: require_env('JWT_SECRET'),
  JWT_REFRESH_SECRET: require_env('JWT_REFRESH_SECRET'),
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY ?? '30d',

  GOOGLE_CLIENT_ID: require_env('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: require_env('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: require_env('GOOGLE_REDIRECT_URI'),

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  ARCHIVE_PATH: process.env.ARCHIVE_PATH ?? '/archives',

  // Gmail API throttle — stay under 250 units/user/sec
  GMAIL_BATCH_SIZE: 100,
  GMAIL_THROTTLE_MS: 500,
} as const

export type Config = typeof config
