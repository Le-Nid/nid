# Contributing

## Development Setup

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Fill .env with dev credentials

# Start in dev mode (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Dev mode exposes:

- Frontend: [http://localhost:3000](http://localhost:3000) with Vite HMR
- Backend: [http://localhost:4000](http://localhost:4000) with `tsx watch`
- PostgreSQL: `localhost:5432` (accessible from DBeaver, TablePlus, etc.)
- Redis: `localhost:6379`
- Swagger: [http://localhost:4000/docs](http://localhost:4000/docs)

---

## Project Structure

```
nid/
├── backend/
│   └── src/
│       ├── auth/           # OAuth2 service
│       ├── gmail/          # Gmail API wrapper
│       ├── archive/        # EML archiving logic
│       ├── jobs/
│       │   ├── queue.ts    # BullMQ queue setup
│       │   └── workers/    # One file per job type
│       ├── routes/         # Fastify endpoints
│       ├── plugins/        # DB, Redis, JWT
│       └── config.ts       # Environment variables
├── frontend/
│   └── src/
│       ├── api/            # Axios client
│       ├── pages/          # One page per route
│       ├── components/     # Reusable components
│       ├── store/          # Zustand stores
│       ├── hooks/          # Custom hooks
│       └── i18n/           # Internationalization
│           ├── index.ts    # i18next config
│           └── locales/    # fr.json, en.json
├── postgres/
│   └── init.sql            # Initial schema
├── docs/                   # VitePress documentation (fr + en)
└── docker-compose.yml
```

---

## Conventions

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`…): the version and changelog are derived from them automatically by semantic-release, which creates a release for each merged `feat`/`fix`. See [Versioning](../installation/production.md#versioning).

### Backend

- **Routes**: one route = one file in `src/routes/`
- **Services**: business logic in `src/{module}/{module}.service.ts`
- **Workers**: one file per job type in `src/jobs/workers/`
- **Validation**: Zod on all route inputs
- **Errors**: `reply.code(xxx).send({ error: 'message' })` — never throw uncaught exceptions

### Frontend

- **Pages**: one page = one file in `src/pages/`
- **Global state**: Zustand (`src/store/`)
- **API calls**: always via `src/api/client.ts` (axios configured with JWT)
- **Components**: house components from `src/components/app/` first, then the shadcn/Radix primitives in `src/components/ui/` (vendored, do not edit), Tailwind v4 styles
- **i18n**: all visible text must go through `t('key')` — never hardcode strings in JSX

---

## Adding Translations (i18n)

The application uses `react-i18next`. All user-facing strings must be translated.

### Adding a Key

1. Add the key in `frontend/src/i18n/locales/fr.json` (French, default language)
2. Add the same key in `frontend/src/i18n/locales/en.json` (English)
3. Use it in the component:

```tsx
const { t } = useTranslation();
<Button>{t('myPage.myButton')}</Button>
```

### Key Naming Convention

Keys follow the `domain.action` format:

```
dashboard.title       → Dashboard page title
mails.search          → Search placeholder
rules.create          → Create rule button
settings.profile      → Profile section in Settings
admin.users           → Admin users tab
```

### Adding a New Language

1. Create `frontend/src/i18n/locales/xx.json` by copying `fr.json`
2. Translate all keys
3. In `frontend/src/i18n/index.ts`, add the resource:
   ```typescript
   import xx from './locales/xx.json';
   resources: { fr: { translation: fr }, en: { translation: en }, xx: { translation: xx } }
   ```
4. Add the option to the language selectors: user menu (`frontend/src/components/app/AppShell.tsx`) and Settings › Account (`frontend/src/pages/settings/AccountSection.tsx`)
5. In `frontend/src/main.tsx`, extend the `<html lang>` computation

---

## Adding a New Job Type

1. Add the type in `backend/src/jobs/queue.ts` → `JobType`
2. Create `backend/src/jobs/workers/my-job.worker.ts`
3. Register the worker in `backend/src/index.ts`
4. Add the trigger route in `backend/src/routes/`
5. Document in `docs/architecture/jobs.md`

---

## Code Quality

### Type Checking

Before each commit, run the typecheck in the modified packages:

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck
```

### IMAP integration tests

`backend/src/__integration__/` tests the IMAP backup and restore against a real Dovecot and a real PostgreSQL (no mocks): incremental sync, chosen folders and start date (`SEARCH SINCE`), restore by `APPEND` into the original folder, refused password. The `backend-imap` CI job starts `postgres:16-alpine` and `dovecot/dovecot:2.4.5` (STARTTLS with a certificate made for `127.0.0.1`, trusted through `NODE_EXTRA_CA_CERTS`: TLS verification stays on). Locally, with an empty Dovecot and database:

```bash
cd backend
DATABASE_URL=postgres://… JWT_SECRET=… GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x GOOGLE_REDIRECT_URI=http://x \
ARCHIVE_PATH=/tmp/archives IMAP_TEST_HOST=127.0.0.1 IMAP_TEST_PORT=31143 IMAP_TEST_PASSWORD=… \
npm run test:integration
```

These tests skip `src/__tests__/setup.ts` (config `vitest.integration.config.ts`) and do not count in the coverage.

### Security Audit

Regularly run a dependency audit to identify known vulnerabilities:

```bash
cd backend && npm audit
cd frontend && npm audit
```

Fix critical and high vulnerabilities immediately. Use `npm audit fix` for automatic fixes.

### Deprecated APIs

- **Never use deprecated APIs** — if ESLint or TypeScript flags a deprecated call, replace it with the recommended alternative
- Check deprecation warnings in the console output during `npm install`

### Icons

- Use **Lucide React** (`lucide-react`) for all icons — no emojis
- Icons must be dark mode compatible (use `currentColor`)

---

## Documentation

Documentation is generated with [VitePress](https://vitepress.dev/) and supports French and English.

```bash
# Docs dev server (from project root)
npm run docs:dev

# Static build
npm run docs:build

# Preview the build
npm run docs:preview
```

Doc files are located in `docs/fr/` (French) and `docs/en/` (English).

Docs are automatically deployed to GitHub Pages via GitHub Actions on every push to `main`.

---

## GitHub Actions

The `.github/workflows/docs.yml` workflow automatically deploys docs to GitHub Pages.

```yaml
# .github/workflows/docs.yml
name: Deploy docs
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run docs:build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: docs/.vitepress/dist
```
