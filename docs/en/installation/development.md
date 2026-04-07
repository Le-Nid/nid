# Development Environment

Guide to contributing to the development of Nid.

---

## Starting in Development Mode

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Development mode provides:

- **Hot reload** for the frontend and backend (mounted volumes)
- **Exposed ports** for PostgreSQL (5432) and Redis (6379)
- **Debug port** Node.js (9229) to attach a debugger

| Service | Port | Description |
|---|---|---|
| Frontend | 3000 | React dev server (Vite HMR) |
| Backend | 4000 | Fastify API |
| Backend debug | 9229 | Node.js inspector |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | BullMQ queue + cache |

---

## Development without Docker

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend automatically loads the `.env` file from the project root via `dotenv/config`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite proxy redirects `/api` to `http://localhost:4000` automatically.

---

## Project Structure

```
nid/
├── backend/
│   └── src/
│       ├── index.ts          # Fastify entry point
│       ├── config.ts         # Environment variables
│       ├── types.ts          # Global types
│       ├── plugins/          # Fastify plugins (db, redis, auth)
│       ├── routes/           # API endpoints
│       ├── jobs/             # BullMQ queue + workers
│       ├── gmail/            # Gmail API service
│       ├── archive/          # EML archiving
│       ├── rules/            # Automated rules
│       ├── auth/             # OAuth2 + SSO
│       ├── privacy/          # Tracking, PII, encryption
│       ├── analytics/        # Heatmap, scores, suggestions
│       ├── notifications/    # In-app notifications
│       ├── webhooks/         # Outgoing webhooks
│       ├── audit/            # Audit log
│       ├── reports/          # Weekly reports
│       ├── dashboard/        # Dashboard cache
│       ├── unsubscribe/      # Newsletter scanning
│       └── utils/            # Utilities
├── frontend/
│   └── src/
│       ├── App.tsx           # Main routing
│       ├── main.tsx          # Entry point + i18n + theme
│       ├── pages/            # Pages (lazy-loaded)
│       ├── components/       # Shared components
│       ├── store/            # Zustand stores
│       ├── api/              # Axios HTTP client
│       ├── hooks/            # React hooks
│       ├── i18n/             # FR/EN translations
│       └── types/            # TypeScript types
├── postgres/
│   └── init.sql              # Initial schema
├── docs/                     # VitePress documentation (fr + en)
├── docker-compose.yml        # Production
└── docker-compose.dev.yml    # Development override
```

---

## Tests

```bash
cd backend
npm test
```

Tests use Vitest with a test PostgreSQL database. The `src/__tests__/setup.ts` file initializes the test environment.

---

## Internationalization (i18n)

### Adding a Translation Key

1. Add the key in `frontend/src/i18n/locales/fr.json`
2. Add the translation in `frontend/src/i18n/locales/en.json`
3. Use `t('my.key')` in the component

### Adding a New Language

1. Create `frontend/src/i18n/locales/xx.json` (copy of `fr.json`)
2. Import the file in `frontend/src/i18n/index.ts`
3. Add the Ant Design locale in `frontend/src/main.tsx`

---

## Documentation

The documentation uses [VitePress](https://vitepress.dev/) with bilingual support (French / English).

```bash
# Serve docs locally
npm run docs:dev

# Build static docs
npm run docs:build
```
