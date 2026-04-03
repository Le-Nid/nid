# Contribuer à Nid

Merci de votre intérêt pour Nid ! Voici comment contribuer.

## Pré-requis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
- **Node.js** ≥ 20 (pour le développement local sans Docker)
- Un **projet Google Cloud** avec l'API Gmail activée

## Lancer en mode développement

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Éditez .env avec vos credentials

# Avec Docker (recommandé)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Ou sans Docker (backend)
cd backend && npm install && npm run dev

# Ou sans Docker (frontend)
cd frontend && npm install && npm run dev
```

## Lancer les tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## Structure du projet

```
backend/          Fastify API (TypeScript, ESM)
  src/
    routes/       Endpoints REST
    db/           Kysely migrations & types
    jobs/         BullMQ workers & scheduler
    plugins/      Fastify plugins (DB, Redis)
frontend/         React SPA (Ant Design)
  src/
    pages/        Pages de l'app
    components/   Composants réutilisables
    api/          Client HTTP Axios
    hooks/        Hooks React custom
docs/             Documentation MkDocs
```

## Conventions

- **TypeScript strict** — pas de `any` sauf cas justifié
- **ESM** — le backend utilise `"type": "module"`
- **Commits** — messages clairs en français ou anglais, préfixes optionnels (`feat:`, `fix:`, `docs:`)
- **Tests** — ajouter des tests pour toute nouvelle fonctionnalité

## Soumettre une contribution

1. Forkez le dépôt
2. Créez une branche (`git checkout -b feat/ma-feature`)
3. Committez vos changements
4. Poussez votre branche (`git push origin feat/ma-feature`)
5. Ouvrez une Pull Request

## Signaler un bug

Ouvrez une [issue](https://github.com/le-nid/nid/issues) avec :
- Description du comportement attendu vs observé
- Étapes pour reproduire
- Version de Docker et de l'app
- Logs pertinents (`docker compose logs backend`)

## Code de conduite

Soyez respectueux et constructif. Toute contribution est la bienvenue.
