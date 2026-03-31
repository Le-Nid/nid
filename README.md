# 📬 Gmail Manager

Application self-hosted de gestion et d'archivage Gmail — Docker, React 19, Fastify, PostgreSQL.

> Vos données restent sur votre NAS. Aucun service tiers, aucune télémétrie.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Fonctionnalités

- 📊 **Dashboard** — top expéditeurs, mails les plus gros, timeline, labels
- 📬 **Bulk ops** — supprimer, labelliser, archiver des milliers de mails en quelques clics
- 📦 **Archive NAS** — stockage EML différentiel sur votre NAS, recherche full-text, preview pièces jointes
- 🤖 **Règles automatiques** — moteur de règles (conditions Gmail + actions), planifiables (hourly/daily/weekly/monthly)
- 📰 **Newsletters** — scanner les headers `List-Unsubscribe`, désabonnement en un clic, suppression en masse
- 📎 **Pièces jointes** — vue dédiée de toutes les PJ (live + archives), tri par taille
- 🔍 **Doublons** — détection et suppression groupée des mails en double
- 📈 **Insights** — rapport hebdomadaire automatique avec statistiques + notifications
- ⚙️ **Jobs** — suivi en temps réel via SSE (Server-Sent Events) + BullMQ
- 🔐 **Multi-utilisateurs** — rôles admin/user, quotas, isolation des données
- 🔑 **Auth sécurisée** — JWT + Google SSO + 2FA/TOTP
- 🔔 **Notifications** — in-app, toast, webhooks (Discord, Slack, Ntfy), préférences par canal
- 📝 **Audit log** — traçabilité complète des actions sensibles
- 🌙 **Dark mode** — thème clair/sombre persisté
- ♿ **Accessibilité** — RGAA (skip link, navigation clavier, aria-labels, HTML sémantique)

## Démarrage rapide

```bash
git clone https://github.com/befa160/gmail-manager.git
cd gmail-manager
cp .env.example .env
# Éditez .env avec vos credentials Google + secrets JWT
docker compose up -d
```

→ [http://localhost:3000](http://localhost:3000)

### Prérequis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
- Un **projet Google Cloud** avec l'API Gmail activée et des credentials OAuth2
- Un NAS ou serveur avec au minimum 1 Go de RAM

### Développement

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Hot reload activé sur frontend et backend. Ports debug Node (9229), PostgreSQL (5432) et Redis (6379) exposés.

## Documentation

📖 [docs.befa160.github.io/gmail-manager](https://befa160.github.io/gmail-manager)

## Stack

| | |
|---|---|
| Frontend | React 19, Ant Design 6, Zustand, React Router 7 |
| Backend | Fastify, TypeScript, Kysely ORM, Zod |
| BDD | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Archives | EML + index PostgreSQL + NAS |
| Auth | JWT, Google OAuth2, TOTP (otplib) |
| Infra | Docker multi-stage, nginx reverse proxy |

## Configuration

Toutes les variables d'environnement sont documentées dans `.env.example` et dans la [doc de configuration](https://befa160.github.io/gmail-manager/getting-started/configuration/).

| Variable | Description |
|---|---|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secrets JWT (générez avec `openssl rand -hex 64`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credentials OAuth2 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Accès base de données |
| `ALLOW_REGISTRATION` | `true` (défaut) ou `false` pour fermer les inscriptions |
| `ADMIN_EMAIL` | Email du premier admin |

## Contribuer

Les contributions sont les bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE)
