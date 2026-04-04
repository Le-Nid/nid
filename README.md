<p align="center">
  <img src="docs/assets/nid-logo-full-light.svg" alt="Nid" height="80" />
</p>

<p align="center">
  <strong><a href="#-english">English</a></strong> · <strong><a href="#-français">Français</a></strong>
</p>

---

<a id="-english"></a>

## English

> Your emails. Your server. Your nid.

A **nid** (nest in french) is an intimate space, built with your own hands, sheltered from prying eyes. That's exactly what Nid is: a self-hosted application that brings your Gmail management back to your own infrastructure — your NAS, your server, your rules.

No third-party cloud. No telemetry. No SaaS account.
Your data stays where it always should have been: **at home**.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

### Features

- 📊 **Dashboard** — top senders, largest emails, timeline, labels
- 📬 **Bulk ops** — delete, label, archive thousands of emails in a few clicks
- 📦 **NAS Archive** — differential EML storage on your NAS, full-text search, attachment preview
- 🤖 **Automatic rules** — rule engine (Gmail conditions + actions), schedulable (hourly/daily/weekly/monthly)
- 📰 **Newsletters** — scan `List-Unsubscribe` headers, one-click unsubscribe, bulk delete
- 📎 **Attachments** — dedicated view of all attachments (live + archived), sort by size
- 🔍 **Duplicates** — grouped detection and deletion of duplicate emails
- 📈 **Insights** — automatic weekly report with statistics + notifications
- ⚙️ **Jobs** — real-time tracking via SSE (Server-Sent Events) + BullMQ
- 🔐 **Multi-user** — admin/user roles, quotas, data isolation
- 🔑 **Secure auth** — JWT + Google SSO + 2FA/TOTP
- 🔔 **Notifications** — in-app, toast, webhooks (Discord, Slack, Ntfy), per-channel preferences
- 📝 **Audit log** — full traceability of sensitive actions
- 🌙 **Dark mode** — persisted light/dark theme
- ♿ **Accessibility** — RGAA (skip link, keyboard navigation, aria-labels, semantic HTML)

### Quick start

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Edit .env with your Google credentials + JWT secrets
docker compose up -d
```

→ [http://localhost:3000](http://localhost:3000)

#### Prerequisites

- **Docker** ≥ 24 and **Docker Compose** ≥ 2.20
- A **Google Cloud project** with the Gmail API enabled and OAuth2 credentials
- A NAS or server with at least 1 GB of RAM

#### Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Hot reload enabled on frontend and backend. Debug ports: Node (9229), PostgreSQL (5432) and Redis (6379) exposed.

### Documentation

📖 [docs.le-nid.github.io/nid](https://le-nid.github.io/nid)

### Stack

| | |
|---|---|
| Frontend | React 19, Ant Design 6, Zustand, React Router 7 |
| Backend | Fastify, TypeScript, Kysely ORM, Zod |
| Database | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Archives | EML + PostgreSQL index + NAS |
| Auth | JWT, Google OAuth2, TOTP (otplib) |
| Infra | Docker multi-stage, nginx reverse proxy |

### Configuration

All environment variables are documented in `.env.example` and in the [configuration docs](https://le-nid.github.io/nid/getting-started/configuration/).

| Variable | Description |
|---|---|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT secrets (generate with `openssl rand -hex 64`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth2 credentials |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Database access |
| `ALLOW_REGISTRATION` | `true` (default) or `false` to close registrations |
| `ADMIN_EMAIL` | First admin's email |

### Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

### License

[Apache 2.0](LICENSE)

---

<a id="-français"></a>

## Français

> Vos mails. Votre serveur. Votre nid.

Un **nid**, c'est un espace intime, construit de ses propres mains, à l'abri des regards. C'est exactement ce qu'est Nid : une application self-hosted qui rapatrie la gestion de vos emails Gmail sur votre propre infrastructure — votre NAS, votre serveur, vos règles.

Pas de cloud tiers. Pas de télémétrie. Pas de compte SaaS.
Vos données restent là où elles ont toujours dû être : **chez vous**.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

### Fonctionnalités

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

### Démarrage rapide

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Éditez .env avec vos credentials Google + secrets JWT
docker compose up -d
```

→ [http://localhost:3000](http://localhost:3000)

#### Prérequis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
- Un **projet Google Cloud** avec l'API Gmail activée et des credentials OAuth2
- Un NAS ou serveur avec au minimum 1 Go de RAM

#### Développement

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Hot reload activé sur frontend et backend. Ports debug Node (9229), PostgreSQL (5432) et Redis (6379) exposés.

### Documentation

📖 [docs.le-nid.github.io/nid](https://le-nid.github.io/nid)

### Stack

| | |
|---|---|
| Frontend | React 19, Ant Design 6, Zustand, React Router 7 |
| Backend | Fastify, TypeScript, Kysely ORM, Zod |
| BDD | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Archives | EML + index PostgreSQL + NAS |
| Auth | JWT, Google OAuth2, TOTP (otplib) |
| Infra | Docker multi-stage, nginx reverse proxy |

### Configuration

Toutes les variables d'environnement sont documentées dans `.env.example` et dans la [doc de configuration](https://le-nid.github.io/nid/getting-started/configuration/).

| Variable | Description |
|---|---|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Secrets JWT (générez avec `openssl rand -hex 64`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credentials OAuth2 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Accès base de données |
| `ALLOW_REGISTRATION` | `true` (défaut) ou `false` pour fermer les inscriptions |
| `ADMIN_EMAIL` | Email du premier admin |

### Contribuer

Les contributions sont les bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

### Licence

[Apache 2.0](LICENSE)
