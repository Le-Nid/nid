# API — Dashboard

---

## Live Gmail stats

### GET /api/dashboard/:accountId/stats

Aggregates statistics from the Gmail API (loads the last 500 messages).

**Query params**

| Param | Default | Description |
|---|---|---|
| `limit` | `20` | Number of results in the tops |
| `refresh` | — | `1`: bypass the Redis cache and recompute |

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
  },
  "cachedAt": "2024-03-15T12:00:00.000Z"
}
```

::: warning Performance
This endpoint performs a batchGet of up to 500 messages and can take 5-10 seconds depending on the Gmail quota. The result is cached in Redis for 10 minutes (`refresh=1` forces a recompute).
:::

---

## Archive stats

### GET /api/dashboard/:accountId/archive-stats

Statistics from PostgreSQL (top 20 senders), cached in Redis for 5 minutes.

```json
{
  "total_mails": 4823,
  "total_size": 5678901234,
  "last_archived_at": "2024-03-15T12:00:00Z",
  "bySender": [
    { "sender": "...", "count": "234", "total_size": "12345678" }
  ],
  "cachedAt": "2024-03-15T12:00:00.000Z"
}
```
