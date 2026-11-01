# API Reference

Nid exposes a REST API via Fastify. All routes are prefixed with `/api`.

Interactive Swagger documentation is available in development at `http://localhost:4000/docs`.

---

## Authentication

All routes require a JWT in the httpOnly `token` cookie (or an `Authorization: Bearer` header), except: `/api/auth/config`, `/api/auth/register`, `/api/auth/login`, `/api/auth/google` (+ `/callback`, `/exchange`), `/api/auth/social/:provider/*`, `/api/auth/gmail/callback` and `/api/shares/public/:token`. Routes with `:accountId` also check that the Gmail account belongs to the user (otherwise `403`). Scripts and Home Assistant use an [API token](auth.md#api-tokens) (`Authorization: Bearer nid_…`) instead of the session.

---

## Endpoints by module

| Module | Prefix | Documentation |
|---|---|---|
| Authentication | `/api/auth` | [auth.md](auth.md) |
| 2FA / TOTP | `/api/auth/2fa` | [auth.md](auth.md#_2fa-totp) |
| Gmail | `/api/gmail` | [gmail.md](gmail.md) |
| Archives | `/api/archive` | [archive.md](archive.md) |
| Dashboard | `/api/dashboard` | [dashboard.md](dashboard.md) |
| Rules | `/api/rules` | [rules.md](rules.md) |
| Jobs (+ per-job SSE `/:jobId/events`) | `/api/jobs` | [jobs.md](jobs.md) |
| Live events (SSE) | `/api/events` | [jobs.md](jobs.md#live-events) |
| Notifications | `/api/notifications` | [notifications.md](notifications.md) |
| Webhooks | `/api/webhooks` | [webhooks.md](webhooks.md) |
| Admin | `/api/admin` | [admin.md](admin.md) |
| Audit | `/api/audit` | [audit.md](audit.md) |
| Newsletters | `/api/unsubscribe` | [unsubscribe.md](unsubscribe.md) |
| Attachments | `/api/attachments` | [attachments.md](attachments.md) |
| Reports | `/api/reports` | [reports.md](reports.md) |
| Integrity | `/api/integrity` | [integrity.md](integrity.md) |
| Configuration | `/api/config` | [config.md](config.md) |
| Privacy | `/api/privacy` | [privacy.md](privacy.md) |
| Analytics | `/api/analytics` | [analytics.md](analytics.md) |
| Saved searches | `/api/saved-searches` | [saved-searches.md](saved-searches.md) |
| Labels | `/api/labels` | [labels.md](labels.md) |
| Unified inbox | `/api/unified` | [unified.md](unified.md) |
| Retention | `/api/retention` | [retention.md](retention.md) |
| Expiration (removed) | — | [expiration.md](expiration.md) |
| Sharing | `/api/shares` | [sharing.md](sharing.md) |
| mbox Import / Export | `/api/import` | [import.md](import.md) |
| Gmail API quota | `/api/quota` | [quota.md](quota.md) |

---

## Summary (Home Assistant)

`GET /api/summary` 🔒 — one small read with everything a dashboard or a Home Assistant REST sensor needs, as plain numbers. Meant for an [API token](auth.md#api-tokens) (`read` is enough).

```json
{
  "accounts": [{ "id", "email", "is_active", "needs_reauth", "last_backup_at", "archived_mails", "archived_bytes", "last_archived_at" }],
  "needs_reauth": 1,
  "archived_mails": 24106, "archived_bytes": 1830000000, "storage_quota_bytes": 5368709120,
  "jobs": { "active": 0, "failed_24h": 1 },
  "unread_notifications": 3
}
```

Home Assistant:

```yaml
rest:
  - resource: https://nid.example.com/api/summary
    headers:
      Authorization: !secret nid_token   # "Bearer nid_…"
    scan_interval: 300
    sensor:
      - name: Nid accounts to reconnect
        value_template: "{{ value_json.needs_reauth }}"
      - name: Nid archived mails
        value_template: "{{ value_json.archived_mails }}"
      - name: Nid failed jobs 24h
        value_template: "{{ value_json.jobs.failed_24h }}"
```

For a push instead of polling, a generic [webhook](webhooks.md) on `account.reauth_required` can target a Home Assistant `webhook` trigger (set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` when Home Assistant is on the local network).

---

## Health check

```
GET /health
```

Outside the `/api` prefix, no authentication. Returns `200` when the service is up:

```json
{ "status": "ok", "version": "0.1.0", "timestamp": "2026-03-20T10:00:00.000Z" }
```

## Metrics

```
GET /api/metrics
Authorization: Bearer <METRICS_TOKEN>
```

Prometheus text format. Only exists when `METRICS_TOKEN` is set (`404` otherwise), `401` on a wrong token. See [Production › Monitoring](../../installation/production.md#monitoring-prometheus).

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
