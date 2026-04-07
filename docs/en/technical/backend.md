# Backend Architecture

## Stack

| Library | Role |
|---|---|
| `fastify` | HTTP framework, performant and TypeScript-first |
| `@fastify/jwt` | JWT auth (access token on every request) |
| `@fastify/cors` | CORS configured for `FRONTEND_URL` only |
| `@fastify/swagger` | Automatic OpenAPI generation |
| `@fastify/rate-limit` | 100 req/min per IP by default |
| `googleapis` | Official Gmail API v1 client |
| `bullmq` | Async job queue (Redis-backed) |
| `postgres` | Lightweight typed PostgreSQL client |
| `ioredis` | Redis client (BullMQ + cache) |
| `zod` | Input validation |
| `mailparser` | EML parsing for reading archives |
| `bcrypt` | Password hashing |
| `otplib` | TOTP code generation and verification (2FA) |
| `qrcode` | QR code generation for 2FA setup |

---

## Fastify Plugin Structure

```
src/plugins/
├── index.ts      ← Registration of all plugins (order matters)
├── db.ts         ← PostgreSQL connection, app.db decorator
└── redis.ts      ← Redis connection, app.redis decorator
```

The `app.authenticate` decorator is defined in `plugins/index.ts` and used as a `preHandler` on all protected routes:

```typescript
app.get('/route-protegee', { preHandler: [app.authenticate] }, async (req) => {
  const { sub: userId, role } = req.user as { sub: string; role: string }
  // ...
})
```

Two additional decorators ensure multi-user isolation:

- **`app.requireAccountOwnership`** — Verifies that the route's `:accountId` parameter belongs to the authenticated user (lookup in `gmail_accounts`). Used on all Gmail, archive, dashboard, and rules routes.
- **`app.requireAdmin`** — Verifies that `role === 'admin'` in the JWT payload. Used on all `/api/admin/*` routes.

```typescript
// Example: route isolated by account
app.get('/mails/:accountId', {
  preHandler: [app.authenticate, app.requireAccountOwnership]
}, handler)

// Example: admin route
app.get('/admin/users', {
  preHandler: [app.authenticate, app.requireAdmin]
}, handler)
```

---

## OAuth2 Token Management

Two Google OAuth2 flows coexist:

1. **Gmail OAuth2** — To connect a Gmail account (scopes `gmail.modify`, `gmail.labels`, `userinfo.email`). Tokens are stored encrypted in `gmail_accounts`.
2. **Google SSO** — For user authentication (scopes `openid`, `userinfo.email`, `userinfo.profile`). Creates or merges a user account based on the `google_id`. The dedicated redirect URI is configured via `GOOGLE_SSO_REDIRECT_URI`.

Google tokens are stored encrypted in the database (`gmail_accounts` table). Refresh is automatic via the Google client `tokens` event:

```typescript
oauth2Client.on('tokens', async (tokens) => {
  // Mise à jour automatique access_token + expiry en base
})
```

::: warning Refresh token
Google only returns the `refresh_token` on the **first** consent (`prompt: 'consent'`). If a user reconnects the same account, the previous refresh_token is preserved via `COALESCE` in SQL. Never overwrite an existing refresh_token with `null`.
:::

Google SSO uses `prompt: 'select_account'` to allow the user to choose their account without re-requesting consent on every login.

---

## Gmail API Throttling

The Gmail API quota is **250 units/user/second**. Each `messages.get` costs 5 units.

The conservative configuration adopted:

```typescript
GMAIL_BATCH_SIZE: 100,   // 100 messages.get en parallèle = 500 unités
GMAIL_THROTTLE_MS: 500,  // Pause 500ms entre chaque batch → ~1000 unités/sec max
```

With throttling, we stay at ~1,000 units/sec which exceeds the quota if multiple users are active simultaneously. In production with multiple accounts, reduce `GMAIL_BATCH_SIZE` to 50 or increase `GMAIL_THROTTLE_MS` to 1000ms.

---

## Unified Worker Startup

A **unified worker** (`unified.worker.ts`) listens on the `nid` queue and dispatches each job by `job.name` via a `switch`. This prevents multiple workers listening on the same queue from stealing each other's jobs.

Each worker injects the `user_id` into the `jobs` table to ensure per-user data isolation.

```typescript
import { startUnifiedWorker } from './jobs/workers/unified.worker'

// Dans bootstrap()
startUnifiedWorker()
```

Job types handled: `bulk_operation`, `archive_mails`, `run_rule`, `scan_unsubscribe`, `scan_tracking`, `scan_pii`, `encrypt_archives`.

---

## Privacy & Security Module

The privacy module (`src/privacy/`) contains three independent services:

```
src/privacy/
├── tracking.service.ts    ← Détection de pixels espions
├── pii.service.ts         ← Scanner de données sensibles (PII)
└── encryption.service.ts  ← Chiffrement AES-256-GCM des archives
```

### Tracking Pixel Detector

The service analyzes the HTML body of Gmail messages to identify three types of trackers:

1. **1×1 pixels** — images with `width=1 height=1`, `display:none` or `visibility:hidden`
2. **Known domains** — database of 35+ ESP domains (Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo…)
3. **UTM parameters** — links containing `utm_source`, `utm_medium`, `utm_campaign`, etc.

The scan is launched as an async job (BullMQ). Results are stored in `tracking_pixels` with JSON details of each detected tracker.

### PII Scanner

The service scans archived EML files on disk to detect sensitive data via regex:

| Type | Description |
|---|---|
| `credit_card` | Visa, Mastercard, Amex card (with separators) |
| `iban` | International IBAN number |
| `french_ssn` | French social security number |
| `password_plain` | Plaintext password (`password:`, `mdp=`, etc.) |
| `phone_fr` | French phone number (+33 / 06…) |

Stored snippets are automatically masked (e.g., `****-****-****-4242`) to avoid exposing actual data.

### Archive Encryption

Encryption uses native Node.js `crypto`, with no external dependency:

- **Algorithm**: AES-256-GCM (confidentiality + integrity)
- **Key derivation**: PBKDF2 (SHA-512, 100,000 iterations, random 32-byte salt)
- **Storage**: only a scrypt hash of the passphrase is stored in the database (`users.encryption_key_hash`), never the passphrase itself
- **Idempotency**: already encrypted files are detected by magic bytes `GMENC01` and skipped
- **On-the-fly decryption**: via the `decrypt-mail` endpoint, the file remains encrypted on disk

---

## EML and MIME Decoding

The archiving service retrieves emails in `raw` format (complete EML encoded in URL-safe base64). Since this format doesn't populate `payload.headers`, headers (Subject, From, To, Date) are parsed directly from the raw EML content.

Subjects using RFC 2047 encoding (`=?UTF-8?B?...?=`, `=?UTF-8?Q?...?=`) are decoded by the `decodeMimeWords()` function which handles:

- **Base64** (`?B?`) — standard decoding
- **Quoted-Printable** (`?Q?`) — replacement of `=XX` and `_` (space)
- **Multiple charsets** — via `TextDecoder` (UTF-8, ISO-8859-1, etc.)
