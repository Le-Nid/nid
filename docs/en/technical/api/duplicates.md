# API — Duplicate Detection

Identify and delete duplicate archived emails (same subject + sender + date).

---

## Detect duplicates

### GET /api/duplicates/:accountId/archived 🔒

Analyzes archived emails and returns groups of duplicates.

Duplicates are identified by the combination `subject + sender + date` (truncated to the minute).

**Response 200**
```json
{
  "groups": [
    {
      "subject": "Votre facture mensuelle",
      "sender": "billing@service.com",
      "date": "2025-12-01T10:30:00Z",
      "count": 3,
      "total_size": 45678,
      "ids": ["uuid-1", "uuid-2", "uuid-3"]
    }
  ],
  "totalGroups": 12,
  "totalDuplicates": 38
}
```

---

## Delete duplicates

### POST /api/duplicates/:accountId/archived/delete 🔒

Deletes specified archived emails (including their attachments on disk).

**Body**
```json
{
  "mailIds": ["uuid-2", "uuid-3"]
}
```

**Response 200**
```json
{ "deleted": 2 }
```

::: tip Keep the most recent
The frontend sorts duplicates and suggests deleting all copies except the most recent one. The IDs to delete are sent explicitly — the backend does not make any automatic choice.
:::
