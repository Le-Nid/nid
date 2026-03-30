# API — Unsubscribe (Newsletters)

Gestion des newsletters et listes de diffusion via les headers `List-Unsubscribe`.

---

## Scanner les newsletters

### POST /api/unsubscribe/:accountId/scan 🔒

Lance un scan asynchrone des headers `List-Unsubscribe` des mails du compte.

**Réponse 202**
```json
{ "jobId": "scan_unsubscribe-123", "message": "Scan enqueued" }
```

---

### GET /api/unsubscribe/:accountId/newsletters 🔒

Scan synchrone (pour les boîtes plus petites). Retourne directement la liste des newsletters détectées.

**Réponse 200**
```json
[
  {
    "sender": "newsletter@example.com",
    "count": 42,
    "totalSizeBytes": 1234567,
    "unsubscribeUrl": "https://example.com/unsubscribe",
    "lastDate": "2026-03-15T10:00:00Z"
  }
]
```

---

## Lister les messages d'un expéditeur

### GET /api/unsubscribe/:accountId/newsletters/:senderEmail/messages 🔒

Récupère tous les IDs de messages d'un expéditeur newsletters donné.

**Réponse 200**
```json
{
  "messageIds": ["msg-1", "msg-2", "msg-3"],
  "count": 3
}
```

---

## Supprimer les mails d'une newsletter

### POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete 🔒

Supprime en masse tous les mails d'un expéditeur newsletters (via job BullMQ).

**Body**
```json
{ "permanent": false }
```

| Champ | Défaut | Description |
|---|---|---|
| `permanent` | `false` | `false` = corbeille, `true` = suppression définitive |

**Réponse 202**
```json
{ "jobId": "bulk_operation-456", "count": 42 }
```
