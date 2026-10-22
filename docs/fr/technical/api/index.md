# Référence API

Nid expose une API REST via Fastify. Toutes les routes sont préfixées par `/api`.

La documentation Swagger interactive est disponible en développement à `http://localhost:4000/docs`.

---

## Authentification

Toutes les routes requièrent un JWT dans le cookie httpOnly `token` (ou un header `Authorization: Bearer`), sauf : `/api/auth/config`, `/api/auth/register`, `/api/auth/login`, `/api/auth/google` (+ `/callback`, `/exchange`), `/api/auth/social/:provider/*`, `/api/auth/gmail/callback` et `/api/shares/public/:token`. Les routes avec `:accountId` vérifient en plus que le compte Gmail appartient à l'utilisateur (`403` sinon).

---

## Endpoints par module

| Module | Préfixe | Documentation |
|---|---|---|
| Authentification | `/api/auth` | [auth.md](auth.md) |
| 2FA / TOTP | `/api/auth/2fa` | [auth.md](auth.md#_2fa-totp) |
| Gmail | `/api/gmail` | [gmail.md](gmail.md) |
| Archives | `/api/archive` | [archive.md](archive.md) |
| Dashboard | `/api/dashboard` | [dashboard.md](dashboard.md) |
| Règles | `/api/rules` | [rules.md](rules.md) |
| Jobs (+ SSE par job `/:jobId/events`) | `/api/jobs` | [jobs.md](jobs.md) |
| Événements en direct (SSE) | `/api/events` | [jobs.md](jobs.md#evenements-en-direct) |
| Notifications | `/api/notifications` | [notifications.md](notifications.md) |
| Webhooks | `/api/webhooks` | [webhooks.md](webhooks.md) |
| Admin | `/api/admin` | [admin.md](admin.md) |
| Audit | `/api/audit` | [audit.md](audit.md) |
| Newsletters | `/api/unsubscribe` | [unsubscribe.md](unsubscribe.md) |
| Pièces jointes | `/api/attachments` | [attachments.md](attachments.md) |
| Rapports | `/api/reports` | [reports.md](reports.md) |
| Intégrité | `/api/integrity` | [integrity.md](integrity.md) |
| Configuration | `/api/config` | [config.md](config.md) |
| Vie privée | `/api/privacy` | [privacy.md](privacy.md) |
| Analytics | `/api/analytics` | [analytics.md](analytics.md) |
| Recherches sauvegardées | `/api/saved-searches` | [saved-searches.md](saved-searches.md) |
| Libellés | `/api/labels` | [labels.md](labels.md) |
| Boîte unifiée | `/api/unified` | [unified.md](unified.md) |
| Rétention | `/api/retention` | [retention.md](retention.md) |
| Expiration | `/api/expiration` | [expiration.md](expiration.md) |
| Partage | `/api/shares` | [sharing.md](sharing.md) |
| Import / Export mbox | `/api/import` | [import.md](import.md) |
| Quota Gmail API | `/api/quota` | [quota.md](quota.md) |

---

## Health check

```
GET /health
```

Hors préfixe `/api`, sans authentification. Retourne `200` si le service est opérationnel :

```json
{ "status": "ok", "version": "0.1.0", "timestamp": "2026-03-20T10:00:00.000Z" }
```

---

## Codes de réponse communs

| Code | Signification |
|---|---|
| `200` | Succès |
| `201` | Ressource créée |
| `202` | Accepté (job asynchrone créé) |
| `400` | Erreur de validation (Zod) |
| `401` | Non authentifié |
| `403` | Accès refusé (rôle ou ownership) |
| `404` | Ressource non trouvée |
| `429` | Rate limit atteint |
| `500` | Erreur serveur |
