# Environnement de développement

Guide pour contribuer au développement de Nid.

---

## Lancement en mode développement

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Le mode développement apporte :

- **Hot reload** du frontend et du backend (volumes montés)
- **Ports exposés** pour PostgreSQL (5432) et Redis (6379)
- **Port debug** Node.js (9229) pour attacher un debugger

| Service | Port | Description |
|---|---|---|
| Frontend | 3000 | React dev server (Vite HMR) |
| Backend | 4000 | API Fastify |
| Backend debug | 9229 | Node.js inspector |
| PostgreSQL | 5432 | Base de données |
| Redis | 6379 | Queue BullMQ + cache |

---

## Développement sans Docker

### Backend

```bash
cd backend
npm install
npm run dev
```

Le backend charge automatiquement le fichier `.env` à la racine du projet via `dotenv/config`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le proxy Vite redirige `/api` vers `http://localhost:4000` automatiquement.

---

## Structure du projet

```
nid/
├── backend/
│   └── src/
│       ├── index.ts          # Point d'entrée Fastify
│       ├── config.ts         # Variables d'environnement
│       ├── types.ts          # Types globaux
│       ├── plugins/          # Plugins Fastify (db, redis, auth)
│       ├── routes/           # Endpoints API
│       ├── jobs/             # Queue BullMQ + workers
│       ├── gmail/            # Service Gmail API
│       ├── archive/          # Archivage EML
│       ├── rules/            # Règles automatiques
│       ├── auth/             # OAuth2 + SSO
│       ├── privacy/          # Tracking, PII, chiffrement
│       ├── analytics/        # Heatmap, scores, suggestions
│       ├── notifications/    # Notifications in-app
│       ├── webhooks/         # Webhooks sortants
│       ├── audit/            # Journal d'audit
│       ├── reports/          # Rapports hebdomadaires
│       ├── dashboard/        # Cache dashboard
│       ├── unsubscribe/      # Scan newsletters
│       └── utils/            # Utilitaires
├── frontend/
│   └── src/
│       ├── App.tsx           # Routing principal
│       ├── main.tsx          # Point d'entrée + i18n + theme
│       ├── pages/            # Pages (lazy-loaded)
│       ├── components/       # Composants partagés
│       ├── store/            # Stores Zustand
│       ├── api/              # Client HTTP axios
│       ├── hooks/            # Hooks React
│       ├── i18n/             # Traductions FR/EN
│       └── types/            # Types TypeScript
├── postgres/
│   └── init.sql              # Schéma initial
├── docs/                     # Documentation VitePress (fr + en)
├── docker-compose.yml        # Production
└── docker-compose.dev.yml    # Override développement
```

---

## Tests

```bash
cd backend
npm test
```

Les tests utilisent Vitest avec une base PostgreSQL de test. Le fichier `src/__tests__/setup.ts` initialise l'environnement de test.

---

## Internationalisation (i18n)

### Ajouter une clé de traduction

1. Ajoutez la clé dans `frontend/src/i18n/locales/fr.json`
2. Ajoutez la traduction dans `frontend/src/i18n/locales/en.json`
3. Utilisez `t('ma.cle')` dans le composant

### Ajouter une nouvelle langue

1. Créez `frontend/src/i18n/locales/xx.json` (copie de `fr.json`)
2. Importez le fichier dans `frontend/src/i18n/index.ts`
3. Ajoutez la locale Ant Design dans `frontend/src/main.tsx`

---

## Documentation

La documentation utilise [VitePress](https://vitepress.dev/) avec support bilingue (français / anglais).

```bash
# Servir la doc en local
npm run docs:dev

# Construire la doc statique
npm run docs:build
```
