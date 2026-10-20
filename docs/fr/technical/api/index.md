# Référence API

Nid expose une API REST via Fastify. Toutes les routes sont préfixées par `/api`.

La documentation Swagger interactive est disponible en développement à `http://localhost:4000/docs`.

---

## Authentification

Toutes les routes (sauf `/api/auth/config`, `/api/auth/register`, `/api/auth/login` et les callbacks OAuth) requièrent un cookie JWT httpOnly.

---

## Endpoints par module

| Module | Préfixe | Documentation |
|---|---|---|
| Authentification | `/api/auth` | [auth.md](auth.md) |
| Gmail | `/api/gmail` | [gmail.md](gmail.md) |
| Archives | `/api/archive` | [archive.md](archive.md) |
| Dashboard | `/api/dashboard` | [dashboard.md](dashboard.md) |
| Règles | `/api/rules` | [rules.md](rules.md) |
| Jobs | `/api/jobs` | [jobs.md](jobs.md) |
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
| Boîte unifiée | `/api/unified` | [unified.md](unified.md) |

---

## Health check

```
GET /health
```

Retourne `200 OK` si le service est opérationnel.

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
