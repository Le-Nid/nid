# AGENTS.md — Nid

## Architecture

Monorepo avec deux packages npm indépendants (`backend/`, `frontend/`) orchestrés par Docker Compose. Pas de workspace npm racine.

- **Backend** (`backend/`) — Fastify 5 + TypeScript, port 4000. ORM Kysely (PostgreSQL 16), job queue BullMQ (Redis 7), Gmail API via `googleapis`. Build avec Vite en ESM (`"type": "module"`).
- **Frontend** (`frontend/`) — React 19 + Vite 8, port 3000. UI shadcn/Radix + Tailwind v4, state Zustand, data fetching React Query 5 + Axios, i18n i18next (fr/en). Proxy dev `/api` → `localhost:4000`.
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
- **Services** : logique métier dans `backend/src/{module}/{module}.service.ts`. La logique va dans un service dès qu'elle a plus d'un consommateur (route, scheduler, worker) ou qu'elle nécessite une transaction ; un CRUD trivial à consommateur unique peut rester dans la route.
- **Base de données** : requêtes Kysely typées. Migrations in-code dans `backend/src/db/migrations/` (numérotées 001–003). Types DB dans `backend/src/db/types.ts` avec `Generated<>` et `ColumnType<>`.
- **Jobs** : un seul worker BullMQ unifié (`backend/src/jobs/workers/unified.worker.ts`, concurrence 3). Enqueue via `enqueueJob()` dans `backend/src/jobs/queue.ts`. Chaque job type a un handler dédié. Progress tracké en DB + SSE.
- **Gmail API** : throttling dans `backend/src/gmail/gmail-throttle.ts` (semaphore par compte, 5 concurrent max, retry exponentiel sur 429/500/503 et 403 rateLimitExceeded).
- **ESM obligatoire** : `"type": "module"` dans package.json, Vite build en format `es` uniquement. Ne jamais utiliser `require()`.

### Frontend

- **Refonte UI** : voir `design/ui-redesign.md`, source de vérité de la phase 2.
- **Pages** : composants dans `frontend/src/pages/`, une page par route définie dans `App.tsx`.
- **API** : client Axios centralisé (`frontend/src/api/client.ts`, `withCredentials: true`). Endpoints groupés par module dans `frontend/src/api/index.ts`. Intercepteur 401 → redirect `/login`.
- **React Query** : hooks dans `frontend/src/hooks/queries.ts` avec query key factories (`queryKeys.dashboard(accountId)`, etc.). staleTime 5min, retry 1.
- **Stores Zustand** : un store par domaine dans `frontend/src/store/` (auth, theme ; les données serveur passent par React Query). Le auth store fait `fetchMe()` au mount.
- **SSE** : hook `useJobSSE(jobId)` dans `frontend/src/hooks/useJobSSE.ts` pour le suivi temps réel des jobs via EventSource.
- **i18n** : fichiers `fr.json`/`en.json` dans `frontend/src/i18n/`. Fallback français. Toujours utiliser `t('key')`.

## Tests

- Framework : **Vitest** avec `globals: true` (pas besoin d'importer `describe`/`it`/`expect`).
- Tests dans `src/__tests__/` (backend et frontend), fichier unique `setup.ts` pour les mocks globaux.
- **Backend** : env `node`, mocks de config, DB Kysely, Gmail service, et `enqueueJob` dans le setup.
- **Frontend** : env `jsdom`, mocks d'Axios, localStorage, `matchMedia`, `ResizeObserver` dans le setup.
- Nommage : `*.test.ts` (backend) ou `*.test.tsx` (frontend).

## Pièges connus

- Le backend doit builder en ESM (`build.lib.formats: ['es']` dans `backend/vite.config.ts`). Un format CommonJS cause `require is not defined` au runtime.
- En dev local (hors Docker), `backend/.env` pointe vers `localhost` pour DATABASE_URL/REDIS_URL. En Docker, utiliser les noms de service `postgres`/`redis`.
- Les lockfiles générés sur le host peuvent manquer des dépendances musl pour `node:26-alpine`. Regénérer dans le conteneur si `npm ci` échoue en Docker.

## Workflow agent

- Avant chaque ouverture de PR : `/ponytail-review` sur le diff complet de la branche, constats « Must fix » / « Should fix » traités (ou justifiés dans la PR) avant le push.
- Une fois le travail terminé : commit, push sur la branche de travail, puis **ouvrir une Pull Request** vers `main` pour validation par le tech lead. Ne jamais merger soi-même.
- Si la PR précédente de la branche est déjà mergée, repartir de `main` et ouvrir une nouvelle PR.

## Outils agent (`.claude/`)

Vendorisés dans le repo pour fonctionner à l'identique en local et en cloud (les plugins Claude Code ne sont pas installés en session cloud).

- **ponytail** v5.3.2 (MIT, [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)) — skills `.claude/skills/ponytail*`, hooks Node `.claude/hooks/ponytail-*.js` (CommonJS, d'où `.claude/hooks/package.json`). Niveaux : `/ponytail lite|full|ultra|off`. Revue : `/ponytail-review`. Ruleset réinjecté à chaque prompt.
- **graphify** v0.9.92 (MIT, [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)) — skill `.claude/skills/graphify`, hooks `graphify-setup.sh` (SessionStart : installe le CLI `graphifyy` en cloud, puis `graphify update .`) et `graphify-prompt.sh` (à chaque prompt : update incrémental en arrière-plan + rappel `graphify query`). En local : `uv tool install graphifyy==0.9.92` une fois. `graphify-out/` est ignoré par git.
- Mise à jour : recopier `skills/` et `hooks/` depuis le tag amont, bumper les versions ici et dans `graphify-setup.sh` / `.graphify_version`.

### graphify

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

### ponytail + graphify

Les deux outils travaillent ensemble : ponytail décide quoi chercher, graphify trouve où. But : recherche rapide et peu de tokens.

**Pendant une feature**

- Étape ponytail « Already in this codebase? » = `graphify query "<besoin>"` (helper, composant, hook, service) avant d'écrire quoi que ce soit.
- Étape ponytail « list every place your change must reach » = `graphify explain "<symbole>()"` sur chaque fonction/composant touché (liens entrants = appelants, tests, worker).
- Lire uniquement les lignes que le graphe a localisées (`sed -n 'L1,L2p'` / Read avec offset+limit), jamais un fichier entier « pour voir ». Imposé par le hook `.claude/hooks/read-guard.js` : Read sans offset/limit ou `cat` seul d'un fichier du projet de plus de 300 lignes est refusé (Read avec `limit` explicite si la lecture complète est vraiment nécessaire). `GRAPH_REPORT.md` seulement pour une question d'architecture.
- `graphify update .` après chaque lot de modifications, pour que la recherche suivante voie le nouveau code.
- Prompts de sous-agents : y recopier ces règles et demander un rapport court (fichiers, sha, tests, écarts).

**Pendant une revue**

- `/ponytail-review` et `/ponytail-audit` commencent par `graphify update .` puis s'appuient sur le graphe avant toute lecture de fichier.
- « Callers of every changed function » : `graphify explain "<fonction>()"` (liens entrants `<--`) pour chaque fonction modifiée du diff, au lieu d'un grep ; `grep` seulement pour confirmer une ligne précise.
- « Trace the real flow » : `graphify path "<entrée>" "<stockage>"` (route → service → DB/worker).
- « reuse: the repo already has this helper » : `graphify query "<ce que fait le code ajouté>"` avant de signaler ou d'écrire un helper.
- Le rapport de revue indique, dans « Not checked », ce que le graphe ne couvre pas (SQL brut, appels dynamiques par nom de job, i18n).
