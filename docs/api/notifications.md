# API — Notifications

Système de notifications in-app pour informer l'utilisateur des événements (rapports, jobs, etc.).

---

## Lister les notifications

### GET /api/notifications 🔒

Retourne les notifications de l'utilisateur authentifié, paginées.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `20` | Résultats par page |
| `unread_only` | — | `1` ou `true` pour n'afficher que les non lues |

**Réponse 200**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "weekly_report",
      "title": "Rapport hebdomadaire",
      "body": "142 mails reçus, 38 archivés cette semaine",
      "data": { "period": "2026-W13" },
      "is_read": false,
      "created_at": "2026-03-30T08:00:00Z"
    }
  ],
  "unreadCount": 3,
  "page": 1,
  "limit": 20
}
```

---

## Marquer comme lue

### PATCH /api/notifications/:notificationId/read 🔒

Marque une notification comme lue.

**Réponse 200**
```json
{ "success": true }
```

---

## Marquer toutes comme lues

### POST /api/notifications/read-all 🔒

Marque toutes les notifications de l'utilisateur comme lues.

**Réponse 200**
```json
{ "updated": 5 }
```

---

## Accès dans l'interface

Les notifications sont accessibles via l'icône **🔔** dans le header de l'application. Le badge rouge indique le nombre de notifications non lues.
