# Architecture Backend

## Stack

| Librairie | Rôle |
|---|---|
| `fastify` | Framework HTTP, performant et TypeScript-first |
| `@fastify/jwt` | Auth JWT (access token sur chaque requête) |
| `@fastify/cors` | CORS configuré sur `FRONTEND_URL` uniquement |
| `@fastify/swagger` | Génération OpenAPI automatique |
| `@fastify/rate-limit` | 100 req/min par IP par défaut |
| `googleapis` | Client officiel Gmail API v1 |
| `bullmq` | Queue de jobs asynchrones (Redis-backed) |
| `postgres` | Client PostgreSQL léger et typé |
| `ioredis` | Client Redis (BullMQ + cache) |
| `zod` | Validation des inputs |
| `mailparser` | Parsing EML pour lecture archives |
| `bcrypt` | Hashage des mots de passe |

---

## Structure des plugins Fastify

```
src/plugins/
├── index.ts      ← Enregistrement de tous les plugins (ordre important)
├── db.ts         ← Connexion PostgreSQL, décoration app.db
└── redis.ts      ← Connexion Redis, décoration app.redis
```

Le décorateur `app.authenticate` est défini dans `plugins/index.ts` et utilisé comme `preHandler` sur toutes les routes protégées :

```typescript
app.get('/route-protegee', { preHandler: [app.authenticate] }, async (req) => {
  const { sub: userId } = req.user as { sub: string }
  // ...
})
```

---

## Gestion des tokens OAuth2

Les tokens Google sont stockés chiffrés en base (table `gmail_accounts`). Le refresh est automatique via l'event `tokens` du client Google :

```typescript
oauth2Client.on('tokens', async (tokens) => {
  // Mise à jour automatique access_token + expiry en base
})
```

!!! warning "Refresh token"
    Google ne retourne le `refresh_token` qu'au **premier** consentement (`prompt: 'consent'`). Si un utilisateur reconnecte le même compte, on conserve l'ancien refresh_token via `COALESCE` en SQL. Ne jamais écraser un refresh_token existant par `null`.

---

## Throttling Gmail API

Le quota Gmail API est de **250 unités/user/seconde**. Chaque `messages.get` coûte 5 unités.

La configuration conservatrice retenue :

```typescript
GMAIL_BATCH_SIZE: 100,   // 100 messages.get en parallèle = 500 unités
GMAIL_THROTTLE_MS: 500,  // Pause 500ms entre chaque batch → ~1000 unités/sec max
```

Avec le throttling, on reste à ~1 000 unités/sec ce qui dépasse le quota si plusieurs users sont actifs simultanément. En production avec plusieurs comptes, réduire `GMAIL_BATCH_SIZE` à 50 ou augmenter `GMAIL_THROTTLE_MS` à 1000ms.

---

## Démarrage des workers

Les workers BullMQ doivent être démarrés au boot du backend. À intégrer dans `src/index.ts` :

```typescript
import { startBulkWorker } from './jobs/workers/bulk.worker'
import { startArchiveWorker } from './jobs/workers/archive.worker'

// Dans bootstrap()
startBulkWorker()
startArchiveWorker()
```
