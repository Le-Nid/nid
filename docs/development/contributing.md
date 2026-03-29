# Contribuer

## Setup développement

```bash
git clone https://github.com/befa160/gmail-manager.git
cd gmail-manager
cp .env.example .env
# Remplir .env avec des credentials de dev

# Lancer en mode dev (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Le mode dev expose :

- Frontend : [http://localhost:3000](http://localhost:3000) avec Vite HMR
- Backend : [http://localhost:4000](http://localhost:4000) avec `tsx watch`
- PostgreSQL : `localhost:5432` (accessible depuis DBeaver, TablePlus, etc.)
- Redis : `localhost:6379`
- Swagger : [http://localhost:4000/docs](http://localhost:4000/docs)

---

## Structure du projet

```
gmail-manager/
├── backend/
│   └── src/
│       ├── auth/           # OAuth2 service
│       ├── gmail/          # Gmail API wrapper
│       ├── archive/        # Logique archivage EML
│       ├── jobs/
│       │   ├── queue.ts    # BullMQ queue setup
│       │   └── workers/    # Un fichier par type de job
│       ├── routes/         # Endpoints Fastify
│       ├── plugins/        # DB, Redis, JWT
│       └── config.ts       # Variables d'environnement
├── frontend/
│   └── src/
│       ├── api/            # Client axios
│       ├── pages/          # Une page par route
│       ├── components/     # Composants réutilisables
│       ├── store/          # Zustand stores
│       └── hooks/          # Custom hooks
├── postgres/
│   └── init.sql            # Schéma initial
├── docs/                   # Documentation MkDocs
└── docker-compose.yml
```

---

## Conventions

### Backend

- **Routes** : une route = un fichier dans `src/routes/`
- **Services** : logique métier dans `src/{module}/{module}.service.ts`
- **Workers** : un fichier par type de job dans `src/jobs/workers/`
- **Validation** : Zod sur tous les inputs des routes
- **Erreurs** : `reply.code(xxx).send({ error: 'message' })` — jamais de throw non catché

### Frontend

- **Pages** : une page = un fichier dans `src/pages/`
- **State global** : Zustand (`src/store/`)
- **Appels API** : toujours via `src/api/client.ts` (axios configuré avec JWT)
- **Composants** : Ant Design en priorité, custom seulement si nécessaire

---

## Ajouter un nouveau type de job

1. Ajouter le type dans `backend/src/jobs/queue.ts` → `JobType`
2. Créer `backend/src/jobs/workers/mon-job.worker.ts`
3. Enregistrer le worker dans `backend/src/index.ts`
4. Ajouter la route de déclenchement dans `backend/src/routes/`
5. Documenter dans `docs/architecture/jobs.md`

---

## Documentation

La documentation est générée avec MkDocs Material.

```bash
# Installer MkDocs
pip install mkdocs-material

# Serveur de dev docs
mkdocs serve

# Build statique
mkdocs build
```

Les docs sont déployées automatiquement sur GitHub Pages via GitHub Actions à chaque push sur `main`.

---

## GitHub Actions

Le workflow `.github/workflows/docs.yml` déploie automatiquement les docs sur GitHub Pages.

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
      - uses: actions/setup-python@v5
        with: { python-version: '3.x' }
      - run: pip install mkdocs-material
      - run: mkdocs gh-deploy --force
```
