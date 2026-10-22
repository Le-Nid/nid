# Architecture Backend

## Stack

| Librairie | Rôle |
|---|---|
| `fastify 5` | Framework HTTP, TypeScript-first |
| `@fastify/jwt` + `@fastify/cookie` | Auth JWT (HS256) lu depuis le cookie httpOnly `token` ou le header `Authorization` |
| `@fastify/cors` | CORS configuré sur `FRONTEND_URL` uniquement |
| `@fastify/rate-limit` | 100 req/min par IP par défaut, limites plus strictes par route |
| `@fastify/multipart` | Upload (import mbox) |
| `@fastify/swagger` + `@fastify/swagger-ui` | OpenAPI, UI sur `/docs` |
| `kysely` + `pg` | Requêtes SQL typées, migrations in-code |
| `bullmq` + `ioredis` | Queue de jobs (Redis), pub/sub SSE, blacklist JWT |
| `googleapis` | Client officiel Gmail API v1 + OAuth2 Gmail |
| `arctic` | OAuth2 des providers de login (Google, Microsoft, Discord, Facebook, LinkedIn, Keycloak) |
| `zod` | Validation des entrées |
| `mailparser` | Parsing EML |
| `imapflow` | Import IMAP |
| `archiver` | Export ZIP |
| `bcrypt` | Hashage des mots de passe |
| `otplib` + `qrcode` | 2FA TOTP |
| `pino` + `pino-pretty` | Logs structurés |
| `@modelcontextprotocol/sdk` | Serveur MCP (`src/mcp-server.ts`) |

Le build se fait avec Vite en ESM (`"type": "module"`, `build.lib.formats: ['es']`) ; `vite.config.mcp.ts` construit le serveur MCP séparément (`npm run build:mcp`, `npm run start:mcp`, transport stdio).

---

## Organisation du code

```
src/
├── index.ts            ← bootstrap : plugins, routes, worker, schedulers, arrêt propre
├── config.ts           ← Variables d'environnement
├── logger.ts           ← createLogger(name)
├── plugins/            ← index.ts (cors, cookie, jwt, rate-limit, multipart, swagger, décorateurs), db.ts, redis.ts
├── routes/             ← Un fichier par module, enregistré sous /api/<module> dans routes/index.ts
├── db/                 ← index.ts (Kysely + Migrator), types.ts, migrations/001…009
├── jobs/               ← queue.ts (enqueueJob), scheduler.ts, workers/unified.worker.ts
├── events/             ← events.service.ts (flux SSE par utilisateur, Redis pub/sub)
├── gmail/              ← gmail.service.ts, gmail-throttle.ts, quota.service.ts
├── auth/               ← oauth.service.ts (Gmail), social.service.ts (login Arctic)
├── archive/            ← archive, body-text, dedup, export, import, integrity, retention, sharing, trash
├── rules/  labels/  unsubscribe/  expiration/  analytics/  dashboard/ (cache)
├── notifications/      ← notify.ts, notification-prefs.service.ts
├── webhooks/  audit/  reports/  privacy/ (encryption.service.ts)  storage/
├── utils/              ← auth.ts (authPresets), db.ts, pagination.ts
└── mcp-server.ts
```

La logique métier va dans un service (`src/{module}/{module}.service.ts`) dès qu'elle a plus d'un consommateur (route, MCP, scheduler, worker) ou qu'elle a besoin d'une transaction ; un CRUD trivial à consommateur unique peut rester dans la route.

---

## Authentification et décorateurs

`plugins/index.ts` définit trois décorateurs :

- **`app.authenticate`** — vérifie le JWT (cookie ou header), refuse un token présent dans la blacklist Redis et un utilisateur désactivé.
- **`app.requireAccountOwnership`** — vérifie que le paramètre `:accountId` appartient à l'utilisateur authentifié (lookup dans `gmail_accounts`).
- **`app.requireAdmin`** — vérifie que `role === 'admin'`.

Les routes les combinent via `authPresets(app)` (`utils/auth.ts`) :

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

Le gestionnaire d'erreurs global renvoie `400 { error, details }` pour une `ZodError`.

---

## Gestion des tokens OAuth2

Deux flux OAuth2 coexistent :

1. **Gmail OAuth2** (`auth/oauth.service.ts`, `googleapis`) — connecte un compte Gmail (scopes `gmail.modify`, `gmail.labels`, `userinfo.email`, `prompt: 'consent'`). Les tokens sont stockés dans `gmail_accounts` (`access_token`, `refresh_token`, `token_expiry`), en clair.
2. **Login social** (`auth/social.service.ts`, `arctic`) — authentifie l'utilisateur (Google et providers optionnels). Le state et le code verifier PKCE sont gardés 5 min dans Redis.

Le refresh Gmail est automatique via l'event `tokens` du client Google :

```typescript
oauth2Client.on('tokens', async (tokens) => {
  // Mise à jour access_token + token_expiry, auth_error_at remis à NULL
})
```

Un token expiré est rafraîchi avant le premier appel ; si Google refuse le refresh token (`invalid_grant`), `gmail_accounts.auth_error_at` est renseigné et l'interface affiche « Action requise » (reconnexion). La déconnexion d'un compte est douce : `is_active = false`, tokens à `NULL`, archives conservées.

::: warning Refresh token
Google ne retourne le `refresh_token` qu'au **premier** consentement. Si un utilisateur reconnecte le même compte, l'ancien refresh_token est conservé via `COALESCE` en SQL. Ne jamais écraser un refresh_token existant par `null` lors d'une reconnexion.
:::

---

## Throttling Gmail API

Le quota Gmail API est de **250 unités/utilisateur/seconde** ; la plupart des appels coûtent 5 unités.

`gmail/gmail-throttle.ts` fournit :

- `gmailRetry()` — jusqu'à 5 tentatives avec backoff exponentiel + jitter (1 s → 60 s max) sur 429, 500, 503 et 403 `rateLimitExceeded` / `userRateLimitExceeded`
- `accountSemaphore()` / `withAccountLimit()` — **5 appels concurrents max par compte**, partagés entre routes et worker
- `limitConcurrency()` — limiteur générique par appel

Paramètres de lot (`config.ts`) :

```typescript
GMAIL_BATCH_SIZE: 25,     // messages par lot
GMAIL_CONCURRENCY: 10,    // appels en parallèle dans un lot
GMAIL_THROTTLE_MS: 1_000, // pause entre deux lots
```

Les actions de masse par requête Gmail sont plafonnées à `BULK_QUERY_MAX` (50 000 par défaut).

---

## Worker unifié et schedulers

`index.ts` démarre, dans le même processus que l'API :

- **`startUnifiedWorker()`** — un seul worker BullMQ (concurrence 3) sur la queue `nid`, qui dispatche par `job.name`. Un worker unique évite que plusieurs workers de la même queue se volent les jobs.
- **`startRuleScheduler()`** (`jobs/scheduler.ts`) — tick de 60 s : règles planifiées, sauvegardes NAS, intégrité, purge, libellés, expirations, partages.
- **`startReportScheduler()`** (`reports/report.scheduler.ts`) — rapport hebdomadaire le lundi.

Sur `SIGTERM`/`SIGINT`, le worker est fermé avant le serveur HTTP. Liste des types de jobs, déclencheurs et cycle de vie : voir [Jobs & Queue](jobs.md).

---

## Chiffrement des archives

`privacy/encryption.service.ts` utilise `crypto` natif Node.js :

- **Algorithme** : AES-256-GCM (confidentialité + intégrité)
- **Dérivation de clé** : PBKDF2 (SHA-512, 100 000 itérations, salt aléatoire 32 octets)
- **Stockage** : seul un hash scrypt de la phrase secrète est conservé en base (`users.encryption_key_hash`), jamais la phrase elle-même
- **Idempotence** : les fichiers déjà chiffrés sont détectés par magic bytes `GMENC01` et ignorés
- **Déchiffrement à la volée** : via `POST /api/privacy/:accountId/encryption/decrypt-mail`, le fichier reste chiffré sur le disque

Le chiffrement s'exécute dans le job `encrypt_archives`. La phrase secrète transite dans le payload BullMQ mais n'est pas copiée dans la table `jobs`.

---

## Décodage EML et MIME

Le service d'archivage récupère les mails au format `raw` (EML complet encodé en base64 URL-safe). Comme ce format ne remplit pas `payload.headers`, les en-têtes (Subject, From, To, Date) sont parsés directement depuis le contenu EML brut.

Les sujets utilisant l'encodage RFC 2047 (`=?UTF-8?B?...?=`, `=?UTF-8?Q?...?=`) sont décodés par la fonction `decodeMimeWords()` qui gère :

- **Base64** (`?B?`) — décodage standard
- **Quoted-Printable** (`?Q?`) — remplacement des `=XX` et `_` (espace)
- **Charsets multiples** — via `TextDecoder` (UTF-8, ISO-8859-1, etc.)

Le texte brut du corps est extrait dans `archived_mails.body_text` (`archive/body-text.ts`) pour la recherche full-text.
