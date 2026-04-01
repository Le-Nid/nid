# AGENTS.md — Gmail Manager

## Architecture

Monorepo avec deux packages npm indépendants (`backend/`, `frontend/`) orchestrés par Docker Compose. Pas de workspace npm racine.

- **Backend** (`backend/`) — Fastify 5 + TypeScript, port 4000. ORM Kysely (PostgreSQL 16), job queue BullMQ (Redis 7), Gmail API via `googleapis`. Build avec Vite en ESM (`"type": "module"`).
- **Frontend** (`frontend/`) — React 19 + Vite 8, port 3000. UI Ant Design 6, state Zustand, data fetching React Query 5 + Axios, i18n i18next (fr/en). Proxy dev `/api` → `localhost:4000`.
- **Infra** — Docker multi-stage unifié (`Dockerfile` racine) : nginx sert le frontend et reverse-proxy `/api` vers le backend Node. En dev, `docker-compose.dev.yml` sépare frontend/backend avec hot-reload + ports debug (9229), PostgreSQL (5432), Redis (6379).

## Commandes essentielles

Chaque package a ses propres dépendances. Toujours exécuter depuis `backend/` ou `frontend/` :

```bash
npm ci                  # Installer les dépendances (lockfile strict)
npm run typecheck       # tsc --noEmit — vérification types
npm run test            # vitest run — tests unitaires
npm run dev             # Serveur dev avec hot-reload
npm run build           # Build production
npm run check           # npm ci + typecheck (raccourci CI)
```

Le script CI (`.github/workflows/ci.yml`) exécute : `npm ci` → `typecheck` → `test --coverage` → `build` pour chaque package.

## Conventions de code

### Backend

- **Routes** : un fichier par module dans `backend/src/routes/`, enregistré comme plugin Fastify dans `routes/index.ts` sous le préfixe `/api/`. Validation des entrées avec **Zod** (schémas dans le fichier route).
- **Auth** : JWT en httpOnly cookie. Décorateurs Fastify `app.authenticate`, `requireAdmin()`, `requireAccountOwnership()`. Rate limiting par route.
- **Services** : logique métier dans `backend/src/{module}/{module}.service.ts`. Les routes appellent les services, jamais de logique DB directe dans les routes.
- **Base de données** : requêtes Kysely typées. Migrations in-code dans `backend/src/db/migrations/` (numérotées 001, 004–007). Types DB dans `backend/src/db/types.ts` avec `Generated<>` et `ColumnType<>`.
- **Jobs** : un seul worker BullMQ unifié (`backend/src/jobs/workers/unified.worker.ts`, concurrence 3). Enqueue via `enqueueJob()` dans `backend/src/jobs/queue.ts`. Chaque job type a un handler dédié. Progress tracké en DB + SSE.
- **Gmail API** : throttling dans `backend/src/gmail/gmail-throttle.ts` (semaphore par compte, 5 concurrent max, retry exponentiel sur 429/503).
- **ESM obligatoire** : `"type": "module"` dans package.json, Vite build en format `es` uniquement. Ne jamais utiliser `require()`.

### Frontend

- **Pages** : composants dans `frontend/src/pages/`, une page par route définie dans `App.tsx`.
- **API** : client Axios centralisé (`frontend/src/api/client.ts`, `withCredentials: true`). Endpoints groupés par module dans `frontend/src/api/index.ts`. Intercepteur 401 → redirect `/login`.
- **React Query** : hooks dans `frontend/src/hooks/queries.ts` avec query key factories (`queryKeys.dashboard(accountId)`, etc.). staleTime 5min, retry 1.
- **Stores Zustand** : un store par domaine dans `frontend/src/store/` (auth, mail, theme, notifications). Le auth store fait `fetchMe()` au mount.
- **SSE** : hook `useJobSSE(jobId)` dans `frontend/src/hooks/useJobSSE.ts` pour le suivi temps réel des jobs via EventSource.
- **i18n** : fichiers `fr.json`/`en.json` dans `frontend/src/i18n/`. Fallback français. Toujours utiliser `t('key')`.

## Tests

- Framework : **Vitest** avec `globals: true` (pas besoin d'importer `describe`/`it`/`expect`).
- Tests dans `src/__tests__/` (backend et frontend), fichier unique `setup.ts` pour les mocks globaux.
- **Backend** : env `node`, mocks de config, DB Kysely, Gmail service, et `enqueueJob` dans le setup.
- **Frontend** : env `jsdom`, mocks d'Axios, localStorage, `matchMedia`, `ResizeObserver`, `getComputedStyle` (requis par Ant Design) dans le setup.
- Nommage : `*.test.ts` (backend) ou `*.test.tsx` (frontend).

## Pièges connus

- Le backend doit builder en ESM (`build.lib.formats: ['es']` dans `backend/vite.config.ts`). Un format CommonJS cause `require is not defined` au runtime.
- Les tests frontend avec Ant Design nécessitent les stubs jsdom (`matchMedia`, `getComputedStyle`) dans `frontend/src/__tests__/setup.ts`.
- En dev local (hors Docker), `backend/.env` pointe vers `localhost` pour DATABASE_URL/REDIS_URL. En Docker, utiliser les noms de service `postgres`/`redis`.
- Les lockfiles générés sur le host peuvent manquer des dépendances musl pour `node:24-alpine`. Regénérer dans le conteneur si `npm ci` échoue en Docker.
