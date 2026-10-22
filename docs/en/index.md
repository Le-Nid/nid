<p align="center">
  <img src="/assets/nid-logo-full-light.svg" alt="Nid" height="80" />
</p>

**Nid** is a self-hosted Gmail management and archiving application, deployed entirely via Docker on your NAS.

It replaces tools like Gmail Cleaner and OpenArchiver, without sending your data to third-party servers.

---

## Features

| Module | Features |
|---|---|
| 📊 **Overview** | Live key figures, top senders, cleanup suggestions |
| 📬 **Mails** | Token-based Gmail search, saved searches, bulk actions with undo, reader, keyboard shortcuts, « All accounts » |
| 🧹 **Cleanup** | Senders and newsletters (List-Unsubscribe), large mails, bulk unsubscribe and delete |
| 🤖 **Rules** | Gmail conditions + actions, scheduling, ready-made templates, labels |
| 📦 **Archives** | EML storage on your NAS, full-text search with highlighting, link sharing, trash, retention |
| 📎 **Attachments** | Gmail and archives, image and PDF preview, deduplication |
| ⚙️ **Activity** | Real-time job tracking (BullMQ + SSE), cancel, retry |
| 🔐 **Accounts** | Local JWT, Google and other SSO providers, 2FA/TOTP, multi-user, automatic backup per Gmail account |
| 🔔 **Notifications** | In-app, webhooks (Discord, Slack, Ntfy, HTTP), weekly report |
| 🛡️ **Admin** | Users, Gmail API quota, audit log, archive integrity, global trash |
| 🔒 **Privacy** | Remote images (and tracking pixels) blocked by the reader until « Show » |
| 💾 **Data** | Configuration export/import, IMAP/mbox import, mbox export |
| 🌐 **i18n** | French / English, light/dark theme, mobile |

---

## Documentation

This documentation is organized in three parts:

- 📥 **[Installation](installation/index.md)** — Quick start, Google Cloud setup, environment variables, production deployment, development environment.

- 📖 **[User Guide](guide/index.md)** — How to use each feature of the application. Ideal for users of all levels.

- 🔧 **[Technical Documentation](technical/overview.md)** — Architecture, database, security, complete API reference. For developers and contributors.

---

## Quick Start

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Edit .env with your Google credentials and secrets
docker compose up -d
```

The application is accessible at [http://localhost:3000](http://localhost:3000).

::: tip First Use
Check the [first steps guide](guide/first-steps.md) to create your account and connect Gmail.
:::

---

## Tech Stack

```
Frontend   →  React 19 + Ant Design + react-i18next
Backend    →  Fastify + TypeScript
Auth       →  Local JWT + OAuth2 Gmail + Multi-provider SSO
Database   →  PostgreSQL 16 (Kysely)
Queue      →  BullMQ + Redis
Archives   →  EML + PostgreSQL index
i18n       →  French 🇫🇷 / English 🇬🇧 (extensible)
```

---

## Why Self-hosted?

- ✅ Your mails stay on your NAS — no data leaves your network
- ✅ Free, no subscription
- ✅ Full control: archives in standard EML format, readable by any mail client
- ✅ Multi-account Gmail from a single interface
