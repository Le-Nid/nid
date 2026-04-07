# API — Attachments

Centralized attachment management: NAS archives and live Gmail.

---

## Archived attachments

### GET /api/attachments/:accountId/archived 🔒

Lists attachments from archived emails with pagination, sorting and search.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `50` | Results per page |
| `sort` | `size` | Sort by: `size` or `date` |
| `order` | `desc` | Order: `asc` or `desc` |
| `q` | — | Search in filename, subject, sender |

**Response 200**
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

## Live Gmail attachments

### GET /api/attachments/:accountId/live 🔒

Scans Gmail messages with attachments (> 100 KB) directly via the Gmail API.

**Query params**

| Param | Default | Description |
|---|---|---|
| `maxResults` | `200` | Maximum number of messages to scan (max 500) |

**Response 200**
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

::: info Gmail API Throttling
The live scan respects Gmail API quotas with a batch of 100 messages max and a 500ms pause between each batch.
:::
