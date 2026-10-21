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
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? '24h', // same lifetime as the auth cookie; the frontend never refreshes

  GOOGLE_CLIENT_ID: require_env('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: require_env('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: require_env('GOOGLE_REDIRECT_URI'),
  GOOGLE_SSO_REDIRECT_URI: process.env.GOOGLE_SSO_REDIRECT_URI ?? '',

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  ARCHIVE_PATH: process.env.ARCHIVE_PATH ?? '/archives',

  // Social OAuth providers (optionnels — les providers non configurés sont désactivés)
  MICROSOFT_CLIENT_ID:     process.env.MICROSOFT_CLIENT_ID ?? '',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ?? '',

  DISCORD_CLIENT_ID:     process.env.DISCORD_CLIENT_ID ?? '',
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ?? '',

  FACEBOOK_CLIENT_ID:     process.env.FACEBOOK_CLIENT_ID ?? '',
  FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET ?? '',

  LINKEDIN_CLIENT_ID:     process.env.LINKEDIN_CLIENT_ID ?? '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET ?? '',

  KEYCLOAK_REALM_URL:     process.env.KEYCLOAK_REALM_URL ?? '',
  KEYCLOAK_CLIENT_ID:     process.env.KEYCLOAK_CLIENT_ID ?? '',
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET ?? '',

  // Premier utilisateur avec ce mail devient admin automatiquement
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',

  // Inscription ouverte ou fermée (défaut: true)
  ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION !== 'false',

  // Webhooks vers le réseau local (ntfy, Home Assistant…) — désactivé par défaut (SSRF)
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === 'true',

  // Plafond d'une action de masse par requête Gmail (« sélectionner tous les résultats ») : le job s'arrête là
  BULK_QUERY_MAX: parseInt(process.env.BULK_QUERY_MAX ?? '50000', 10),
  // Sauvegarde NAS par requête plafonnée à BULK_QUERY_MAX : la suite est remise en file après ce délai (minutes),
  // au plus ARCHIVE_CHAIN_MAX fois d'affilée
  ARCHIVE_CONTINUE_DELAY_MIN: parseInt(process.env.ARCHIVE_CONTINUE_DELAY_MIN ?? '15', 10),
  ARCHIVE_CHAIN_MAX: parseInt(process.env.ARCHIVE_CHAIN_MAX ?? '20', 10),

  // Gmail API throttle — stay under 250 quota units/user/sec
  // Most endpoints = 5 units → max ~50 concurrent requests/sec
  GMAIL_BATCH_SIZE: 25,
  GMAIL_THROTTLE_MS: 1_000,
  GMAIL_CONCURRENCY: 10,
} as const

export type Config = typeof config
