# 📬 Gmail Manager

Application self-hosted de gestion et d'archivage Gmail — Docker, React 19, Fastify, PostgreSQL.

> Remplace Gmail Cleaner + OpenArchiver. Vos données restent sur votre NAS.

## Fonctionnalités

- 📊 **Dashboard** — top expéditeurs, mails les plus gros, timeline, labels
- 📬 **Bulk ops** — supprimer, labelliser, archiver des milliers de mails en quelques clics
- 📦 **Archive NAS** — stockage EML différentiel, recherche full-text, preview pièces jointes
- ⚙️ **Jobs** — suivi en temps réel des opérations longues via BullMQ
- 🔐 **Multi-compte Gmail** — plusieurs comptes Gmail, auth locale JWT

## Démarrage rapide

```bash
git clone https://github.com/befa160/gmail-manager.git
cd gmail-manager
cp .env.example .env
# Configurer .env (voir docs)
docker compose up -d
```

→ [http://localhost:3000](http://localhost:3000)

## Documentation

📖 [docs.befa160.github.io/gmail-manager](https://befa160.github.io/gmail-manager)

## Stack

| | |
|---|---|
| Frontend | React 19 + Ant Design |
| Backend | Fastify + TypeScript |
| BDD | PostgreSQL 16 |
| Queue | BullMQ + Redis |
| Archives | EML + index PostgreSQL |

## Licence

MIT
