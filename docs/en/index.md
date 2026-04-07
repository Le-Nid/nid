<p align="center">
  <img src="/assets/nid-logo-full-light.svg" alt="Nid" height="80" />
</p>

**Nid** is a self-hosted Gmail management and archiving application, deployed entirely via Docker on your NAS.

It replaces tools like Gmail Cleaner and OpenArchiver, without sending your data to third-party servers.

---

## Features

| Module | Features |
|---|---|
| 📊 **Dashboard** | Top senders, largest mails, timeline, label breakdown |
| 📬 **Mail Management** | Bulk delete/label/archive, reading, attachments, auto rules |
| 📦 **Archives** | EML storage on NAS, full-text search, differential |
| ⚙️ **Jobs** | Real-time tracking of long operations (BullMQ + SSE) |
| 🔐 **Auth** | Local JWT + Google SSO + multi-providers, 2FA/TOTP, multi-user |
| 📧 **Newsletters** | List-Unsubscribe header scan, bulk cleanup |
| 📎 **Attachments** | Dedicated manager (live Gmail + archives), sort by size |
| 🔁 **Duplicates** | Detection and deletion of duplicate archived mails |
| 📋 **Templates** | Pre-configured rule library, one-click activation |
| 📈 **Analytics** | Heatmap, clutter scores, cleanup suggestions, Inbox Zero |
| 📝 **Audit Log** | Activity journal tracking sensitive actions |
| 🔗 **Webhooks** | Discord, Slack, Ntfy or generic HTTP notifications |
| 🛡️ **Integrity** | Archive consistency check: disk ↔ database |
| 🔒 **Privacy** | Tracking pixel detection, PII scanner, AES-256 archive encryption |
| ⌨️ **Keyboard Shortcuts** | Fast navigation and actions in My Mails |
| 💾 **Export/Import** | Configuration backup and restore (rules, webhooks) |
| 🌐 **i18n** | French / English, language selector, preference persistence |
| 📬 **Unified Inbox** | All your Gmail accounts in a single view |
| 🔍 **Searches** | Saved searches with icons and colors |
| ⚙️ **Ops & Resilience** | S3/MinIO storage, retention policies, Gmail API quota tracking, IMAP/mbox import, mbox export |

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
