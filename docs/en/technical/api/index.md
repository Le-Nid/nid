# API Reference

Nid exposes a REST API via Fastify. All routes are prefixed with `/api`.

Interactive Swagger documentation is available in development at `http://localhost:4000/docs`.

---

## Authentication

All routes (except `/api/auth/config`, `/api/auth/register`, `/api/auth/login` and OAuth callbacks) require an httpOnly JWT cookie.

---

## Endpoints by module

| Module | Prefix | Documentation |
|---|---|---|
| Authentication | `/api/auth` | [auth.md](auth.md) |
| Gmail | `/api/gmail` | [gmail.md](gmail.md) |
| Archives | `/api/archive` | [archive.md](archive.md) |
| Dashboard | `/api/dashboard` | [dashboard.md](dashboard.md) |
| Rules | `/api/rules` | [rules.md](rules.md) |
| Jobs | `/api/jobs` | [jobs.md](jobs.md) |
| Notifications | `/api/notifications` | [notifications.md](notifications.md) |
| Webhooks | `/api/webhooks` | [webhooks.md](webhooks.md) |
| Admin | `/api/admin` | [admin.md](admin.md) |
| Audit | `/api/audit` | [audit.md](audit.md) |
| Newsletters | `/api/unsubscribe` | [unsubscribe.md](unsubscribe.md) |
| Attachments | `/api/attachments` | [attachments.md](attachments.md) |
| Duplicates | `/api/duplicates` | [duplicates.md](duplicates.md) |
| Reports | `/api/reports` | [reports.md](reports.md) |
| Integrity | `/api/integrity` | [integrity.md](integrity.md) |
| Configuration | `/api/config` | [config.md](config.md) |
| Privacy | `/api/privacy` | [privacy.md](privacy.md) |
| Analytics | `/api/analytics` | [analytics.md](analytics.md) |
| Saved searches | `/api/saved-searches` | [saved-searches.md](saved-searches.md) |
| Unified inbox | `/api/unified` | [unified.md](unified.md) |

---

## Health check

```
GET /health
```

Returns `200 OK` if the service is operational.

---

## Common response codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `202` | Accepted (async job created) |
| `400` | Validation error (Zod) |
| `401` | Not authenticated |
| `403` | Access denied (role or ownership) |
| `404` | Resource not found |
| `429` | Rate limit reached |
| `500` | Server error |
