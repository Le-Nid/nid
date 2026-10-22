# Backend Architecture

## Stack

| Library | Role |
|---|---|
| `fastify 5` | HTTP framework, TypeScript-first |
| `@fastify/jwt` + `@fastify/cookie` | JWT auth (HS256) read from the httpOnly `token` cookie or the `Authorization` header |
| `@fastify/cors` | CORS restricted to `FRONTEND_URL` |
| `@fastify/rate-limit` | 100 req/min per IP by default, stricter limits per route |
| `@fastify/multipart` | Uploads (mbox import) |
| `@fastify/swagger` + `@fastify/swagger-ui` | OpenAPI, UI at `/docs` |
| `kysely` + `pg` | Typed SQL queries, in-code migrations |
| `bullmq` + `ioredis` | Job queue (Redis), SSE pub/sub, JWT blacklist |
| `googleapis` | Official Gmail API v1 client + Gmail OAuth2 |
| `arctic` | OAuth2 for login providers (Google, Microsoft, Discord, Facebook, LinkedIn, Keycloak) |
| `zod` | Input validation |
| `mailparser` | EML parsing |
| `imapflow` | IMAP import |
| `archiver` | ZIP export |
| `bcrypt` | Password hashing |
| `otplib` + `qrcode` | TOTP 2FA |
| `pino` + `pino-pretty` | Structured logs |
| `@modelcontextprotocol/sdk` | MCP server (`src/mcp-server.ts`) |

The build uses Vite in ESM (`"type": "module"`, `build.lib.formats: ['es']`); `vite.config.mcp.ts` builds the MCP server separately (`npm run build:mcp`, `npm run start:mcp`, stdio transport).

---

## Code Layout

```
src/
├── index.ts            ← bootstrap: plugins, routes, worker, schedulers, graceful shutdown
├── config.ts           ← Environment variables
├── logger.ts           ← createLogger(name)
├── plugins/            ← index.ts (cors, cookie, jwt, rate-limit, multipart, swagger, decorators), db.ts, redis.ts
├── routes/             ← One file per module, registered under /api/<module> in routes/index.ts
├── db/                 ← index.ts (Kysely + Migrator), types.ts, migrations/001…009
├── jobs/               ← queue.ts (enqueueJob), scheduler.ts, workers/unified.worker.ts
├── events/             ← events.service.ts (per-user SSE stream, Redis pub/sub)
├── gmail/              ← gmail.service.ts, gmail-throttle.ts, quota.service.ts
├── auth/               ← oauth.service.ts (Gmail), social.service.ts (Arctic login)
├── archive/            ← archive, body-text, dedup, export, import, integrity, retention, sharing, trash
├── rules/  labels/  unsubscribe/  expiration/  analytics/  dashboard/ (cache)
├── notifications/      ← notify.ts, notification-prefs.service.ts
├── webhooks/  audit/  reports/  privacy/ (encryption.service.ts)  storage/
├── utils/              ← auth.ts (authPresets), db.ts, pagination.ts
└── mcp-server.ts
```

Business logic goes into a service (`src/{module}/{module}.service.ts`) as soon as it has more than one consumer (route, MCP, scheduler, worker) or needs a transaction; a trivial single-consumer CRUD can stay in the route.

---

## Authentication and Decorators

`plugins/index.ts` defines three decorators:

- **`app.authenticate`** — verifies the JWT (cookie or header), rejects a token found in the Redis blacklist and a disabled user.
- **`app.requireAccountOwnership`** — checks that the `:accountId` route parameter belongs to the authenticated user (lookup in `gmail_accounts`).
- **`app.requireAdmin`** — checks that `role === 'admin'`.

Routes combine them through `authPresets(app)` (`utils/auth.ts`):

```typescript
const { auth, accountAuth, adminAuth } = authPresets(app)
// auth        = { preHandler: [app.authenticate] }
// accountAuth = { preHandler: [app.authenticate, app.requireAccountOwnership] }
// adminAuth   = { preHandler: [app.authenticate, app.requireAdmin] }

app.get('/:accountId/mails', accountAuth, async (request) => {
  const userId = request.user.sub
  // ...
})
```

The global error handler answers `400 { error, details }` for a `ZodError`.

---

## OAuth2 Token Management

Two OAuth2 flows coexist:

1. **Gmail OAuth2** (`auth/oauth.service.ts`, `googleapis`) — connects a Gmail account (scopes `gmail.modify`, `gmail.labels`, `userinfo.email`, `prompt: 'consent'`). Tokens are stored in `gmail_accounts` (`access_token`, `refresh_token`, `token_expiry`), in plain text.
2. **Social login** (`auth/social.service.ts`, `arctic`) — authenticates the user (Google and optional providers). The state and the PKCE code verifier are kept 5 min in Redis.

Gmail refresh is automatic through the Google client's `tokens` event:

```typescript
oauth2Client.on('tokens', async (tokens) => {
  // Updates access_token + token_expiry, resets auth_error_at to NULL
})
```

An expired token is refreshed before the first call; when Google refuses the refresh token (`invalid_grant`), `gmail_accounts.auth_error_at` is set and the UI shows "Action required" (reconnect). Disconnecting an account is soft: `is_active = false`, tokens set to `NULL`, archives kept.

::: warning Refresh token
Google only returns the `refresh_token` on the **first** consent. When a user reconnects the same account, the old refresh_token is kept via `COALESCE` in SQL. Never overwrite an existing refresh_token with `null` on reconnection.
:::

---

## Gmail API Throttling

The Gmail API quota is **250 units/user/second**; most calls cost 5 units.

`gmail/gmail-throttle.ts` provides:

- `gmailRetry()` — up to 5 attempts with exponential backoff + jitter (1 s → 60 s max) on 429, 500, 503 and 403 `rateLimitExceeded` / `userRateLimitExceeded`
- `accountSemaphore()` / `withAccountLimit()` — **at most 5 concurrent calls per account**, shared between routes and the worker
- `limitConcurrency()` — generic per-call limiter

Batch settings (`config.ts`):

```typescript
GMAIL_BATCH_SIZE: 25,     // messages per batch
GMAIL_CONCURRENCY: 10,    // parallel calls within a batch
GMAIL_THROTTLE_MS: 1_000, // pause between two batches
```

Bulk actions on a Gmail query are capped at `BULK_QUERY_MAX` (50,000 by default).

---

## Unified Worker and Schedulers

`index.ts` starts, in the same process as the API:

- **`startUnifiedWorker()`** — a single BullMQ worker (concurrency 3) on the `nid` queue, dispatching on `job.name`. A single worker prevents several workers on the same queue from stealing each other's jobs.
- **`startRuleScheduler()`** (`jobs/scheduler.ts`) — 60 s tick: scheduled rules, NAS backups, integrity, purge, labels, expirations, shares.
- **`startReportScheduler()`** (`reports/report.scheduler.ts`) — weekly report on Mondays.

On `SIGTERM`/`SIGINT`, the worker is closed before the HTTP server. Job types, triggers and lifecycle: see [Jobs & Queue](jobs.md).

---

## Archive Encryption

`privacy/encryption.service.ts` uses native Node.js `crypto`:

- **Algorithm**: AES-256-GCM (confidentiality + integrity)
- **Key derivation**: PBKDF2 (SHA-512, 100,000 iterations, random 32-byte salt)
- **Storage**: only a scrypt hash of the passphrase is stored in the database (`users.encryption_key_hash`), never the passphrase itself
- **Idempotency**: already-encrypted files are detected by the `GMENC01` magic bytes and skipped
- **On-the-fly decryption**: via `POST /api/privacy/:accountId/encryption/decrypt-mail`, the file stays encrypted on disk

Encryption runs in the `encrypt_archives` job. The passphrase travels in the BullMQ payload but is not copied into the `jobs` table.

---

## EML and MIME Decoding

The archive service fetches emails in `raw` format (full EML encoded as URL-safe base64). Since this format does not populate `payload.headers`, the headers (Subject, From, To, Date) are parsed directly from the raw EML content.

Subjects using RFC 2047 encoding (`=?UTF-8?B?...?=`, `=?UTF-8?Q?...?=`) are decoded by the `decodeMimeWords()` function, which handles:

- **Base64** (`?B?`) — standard decoding
- **Quoted-Printable** (`?Q?`) — replacement of `=XX` and `_` (space)
- **Multiple charsets** — via `TextDecoder` (UTF-8, ISO-8859-1, etc.)

The plain-text body is extracted into `archived_mails.body_text` (`archive/body-text.ts`) for full-text search.
