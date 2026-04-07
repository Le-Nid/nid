# API — Pièces jointes

Gestion centralisée des pièces jointes : archives sur NAS et live Gmail.

---

## Pièces jointes archivées

### GET /api/attachments/:accountId/archived 🔒

Liste les PJ des mails archivés avec pagination, tri et recherche.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `50` | Résultats par page |
| `sort` | `size` | Tri : `size` ou `date` |
| `order` | `desc` | Ordre : `asc` ou `desc` |
| `q` | — | Recherche dans filename, subject, sender |

**Réponse 200**
```json
{
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture-mars-2026.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 245000,
      "file_path": "/archives/...",
      "mail_subject": "Votre facture",
      "mail_sender": "billing@service.com",
      "mail_date": "2026-03-01T10:00:00Z",
      "gmail_message_id": "msg-123",
      "archived_mail_id": "uuid"
    }
  ],
  "total": 156,
  "totalSizeBytes": 52428800,
  "page": 1,
  "limit": 50
}
```

---

## Pièces jointes live Gmail

### GET /api/attachments/:accountId/live 🔒

Scanne les mails Gmail avec PJ (> 100 Ko) directement via l'API Gmail.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `maxResults` | `200` | Nombre max de messages à scanner (max 500) |

**Réponse 200**
```json
{
  "attachments": [
    {
      "messageId": "msg-456",
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 1500000,
      "mailSubject": "Vacances",
      "mailSender": "ami@gmail.com",
      "mailDate": "2026-02-15",
      "mailSizeEstimate": 1600000
    }
  ],
  "totalSizeBytes": 45000000
}
```

::: info Throttling Gmail API
Le scan live respecte les quotas Gmail API avec un batch de 100 messages max et une pause de 500ms entre chaque batch.
:::
