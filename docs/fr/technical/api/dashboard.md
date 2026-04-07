# API — Dashboard

---

## Stats Gmail live

### GET /api/dashboard/:accountId/stats

Agrège les statistiques depuis la Gmail API (charge les 500 derniers messages).

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `limit` | `20` | Nombre de résultats dans les tops |

**Réponse**
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
Ce endpoint fait un batchGet de jusqu'à 500 messages. Il peut prendre 5-10 secondes selon la vitesse du quota Gmail. Prévoir un cache Redis en v1.1.
:::

---

## Stats archives

### GET /api/dashboard/:accountId/archive-stats

Statistiques depuis PostgreSQL (instantané).

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
