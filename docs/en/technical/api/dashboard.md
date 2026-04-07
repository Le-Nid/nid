# API — Dashboard

---

## Live Gmail stats

### GET /api/dashboard/:accountId/stats

Aggregates statistics from the Gmail API (loads the last 500 messages).

**Query params**

| Param | Default | Description |
|---|---|---|
| `limit` | `20` | Number of results in the tops |

**Response**
```json
{
  "totalMessages": 5234,
  "unreadCount": 142,
  "totalSizeBytes": 2345678901,
  "bySender": [
    { "sender": "newsletter@exemple.com", "count": 234, "sizeBytes": 12345678 }
  ],
  "biggestMails": [
    { "id": "abc", "subject": "Photos vacances", "sizeEstimate": 15000000, "from": "..." }
  ],
  "byLabel": [
    { "label": "INBOX", "count": 450 },
    { "label": "UNREAD", "count": 142 }
  ],
  "timeline": [
    { "month": "2024-01", "count": 87 },
    { "month": "2024-02", "count": 124 }
  ],
  "profile": {
    "emailAddress": "compte@gmail.com",
    "messagesTotal": 5234
  }
}
```

::: warning Performance
This endpoint performs a batchGet of up to 500 messages. It can take 5-10 seconds depending on the Gmail quota speed. A Redis cache is planned for v1.1.
:::

---

## Archive stats

### GET /api/dashboard/:accountId/archive-stats

Statistics from PostgreSQL (instant).

```json
{
  "total_mails": 4823,
  "total_size": 5678901234,
  "last_archived_at": "2024-03-15T12:00:00Z",
  "bySender": [
    { "sender": "...", "count": "234", "total_size": "12345678" }
  ]
}
```
