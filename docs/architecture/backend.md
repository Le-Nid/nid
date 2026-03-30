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
  const { sub: userId, role } = req.user as { sub: string; role: string }
  // ...
})
```

Deux décorateurs supplémentaires assurent l’isolation multi-utilisateurs :

- **`app.requireAccountOwnership`** — Vérifie que le paramètre `:accountId` de la route appartient bien à l’utilisateur authentifié (lookup dans `gmail_accounts`). Utilisé sur toutes les routes Gmail, archive, dashboard et rules.
- **`app.requireAdmin`** — Vérifie que `role === 'admin'` dans le payload JWT. Utilisé sur toutes les routes `/api/admin/*`.

```typescript
// Exemple : route isolée par compte
app.get('/mails/:accountId', {
  preHandler: [app.authenticate, app.requireAccountOwnership]
}, handler)

// Exemple : route admin
app.get('/admin/users', {
  preHandler: [app.authenticate, app.requireAdmin]
}, handler)
```

---

## Gestion des tokens OAuth2
Deux flux OAuth2 Google coexistent :

1. **Gmail OAuth2** — Pour connecter un compte Gmail (scopes `gmail.modify`, `gmail.labels`, `userinfo.email`). Les tokens sont stockés chiffrés dans `gmail_accounts`.
2. **Google SSO** — Pour l’authentification utilisateur (scopes `openid`, `userinfo.email`, `userinfo.profile`). Crée ou fusionne un compte utilisateur basé sur le `google_id`. Le redirect URI dédié est configuré via `GOOGLE_SSO_REDIRECT_URI`.
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

Chaque worker injecte le `user_id` dans la table `jobs` pour assurer l’isolation des données par utilisateur.

```typescript
import { startBulkWorker } from './jobs/workers/bulk.worker'
import { startArchiveWorker } from './jobs/workers/archive.worker'

// Dans bootstrap()
startBulkWorker()
startArchiveWorker()
```
