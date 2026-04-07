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
- **Components**: Ant Design first, custom only if necessary
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
4. In `frontend/src/main.tsx`, add the corresponding Ant Design locale
5. In `frontend/src/components/AppLayout.tsx`, add the option to the language selector

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

- Use **Lucide React** (`lucide-react`) for all icons — no emojis or Ant Design icons
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
