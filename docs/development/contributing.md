# Contribuer

## Setup développement

```bash
git clone https://github.com/le-nid/nid.git
cd nid
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
nid/
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
│       ├── hooks/          # Custom hooks
│       └── i18n/           # Internationalisation
│           ├── index.ts    # Config i18next
│           └── locales/    # fr.json, en.json
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
- **i18n** : tout texte visible doit passer par `t('clé')` — jamais de chaînes en dur dans le JSX

---

## Ajouter des traductions (i18n)

L'application utilise `react-i18next`. Toutes les chaînes visibles par l'utilisateur doivent être traduites.

### Ajouter une clé

1. Ajoutez la clé dans `frontend/src/i18n/locales/fr.json` (français, langue par défaut)
2. Ajoutez la même clé dans `frontend/src/i18n/locales/en.json` (anglais)
3. Utilisez-la dans le composant :

```tsx
const { t } = useTranslation();
<Button>{t('maPage.monBouton')}</Button>
```

### Convention de nommage des clés

Les clés suivent le format `domaine.action` :

```
dashboard.title       → Titre de la page Dashboard
mails.search          → Placeholder de recherche
rules.create          → Bouton créer une règle
settings.profile      → Section profil dans Settings
admin.users           → Onglet utilisateurs admin
```

### Ajouter une nouvelle langue

1. Créez `frontend/src/i18n/locales/xx.json` en copiant `fr.json`
2. Traduisez toutes les clés
3. Dans `frontend/src/i18n/index.ts`, ajoutez la ressource :
   ```typescript
   import xx from './locales/xx.json';
   resources: { fr: { translation: fr }, en: { translation: en }, xx: { translation: xx } }
   ```
4. Dans `frontend/src/main.tsx`, ajoutez la locale Ant Design correspondante
5. Dans `frontend/src/components/AppLayout.tsx`, ajoutez l'option au sélecteur de langue

---

## Ajouter un nouveau type de job

1. Ajouter le type dans `backend/src/jobs/queue.ts` → `JobType`
2. Créer `backend/src/jobs/workers/mon-job.worker.ts`
3. Enregistrer le worker dans `backend/src/index.ts`
4. Ajouter la route de déclenchement dans `backend/src/routes/`
5. Documenter dans `docs/architecture/jobs.md`

---

## Qualité de code

### Vérification des types

Avant chaque commit, exécutez le typecheck dans les packages modifiés :

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck
```

### Audit de sécurité

Exécutez régulièrement un audit des dépendances pour identifier les vulnérabilités connues :

```bash
cd backend && npm audit
cd frontend && npm audit
```

Corrigez les vulnérabilités critiques et hautes immédiatement. Utilisez `npm audit fix` pour les corrections automatiques.

### APIs dépréciées

- **Ne jamais utiliser d'APIs dépréciées** — si ESLint ou TypeScript signale un appel déprécié, remplacez-le par l'alternative recommandée
- Vérifiez les avertissements de dépréciation dans la sortie console lors du `npm install`

### Icônes

- Utiliser **Lucide React** (`lucide-react`) pour toutes les icônes — pas d'emojis ni d'icônes Ant Design
- Les icônes doivent être compatibles dark mode (utiliser `currentColor`)

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
