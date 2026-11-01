# API — Analytics (Intelligence & Advanced Analytics)

---

## Email activity heatmap

### GET /api/analytics/:accountId/heatmap

Day × hour grid of when mail arrives, computed on each call from **the whole archive** of the account (Nid trash excluded), Gmail and IMAP alike, with no Gmail call. Shown in the Overview (« When your mail arrives »).

**Query params**

| Param | Default | Description |
|---|---|---|
| `tz` | `UTC` | IANA time zone in which days and hours are counted (`Europe/Paris`); the frontend sends the browser's. Unknown zone: 400 |

**Response**
```json
[
  { "day": 0, "hour": 9, "count": 42 },
  { "day": 0, "hour": 10, "count": 38 },
  { "day": 1, "hour": 14, "count": 25 }
]
```

| Field | Type | Description |
|---|---|---|
| `day` | integer | Day of the week (0=Monday, 6=Sunday) |
| `hour` | integer | Hour of the day (0-23) |
| `count` | integer | Archived mails received in this slot |

Only non-empty slots are returned.

**Authentication**: JWT + account ownership

---

## Sender clutter score

Internal computation (no endpoint) feeding the cleanup suggestions below: volume, size, read rate and `List-Unsubscribe`, over the last 500 Gmail mails, cached 15 min.

**Score calculation**:
- Volume (0-30 pts): proportional to number of emails (capped at 50)
- Size (0-25 pts): proportional to total size (capped at 50 MB)
- Inverted read rate (0-25 pts): the lower the rate, the higher the score
- Unsubscribe (0-20 pts): bonus if the sender is a newsletter/promotion

---

## Smart cleanup suggestions

### GET /api/analytics/:accountId/cleanup-suggestions

Heuristics based on analyzed data to suggest concrete cleanup actions.

**Query params**

| Param | Default | Description |
|---|---|---|
| `refresh` | - | `1` to force recalculation |

**Response**
```json
[
  {
    "id": "uuid",
    "type": "bulk_unread",
    "title": "847 emails non lus de GitHub",
    "description": "Vous avez 847 emails non lus de cet expéditeur. Volume total : 1.2 Go.",
    "sender": "notifications@github.com",
    "emailCount": 847,
    "totalSizeBytes": 1288490188,
    "query": "from:(notifications@github.com) is:unread",
    "isDismissed": false
  }
]
```

| Field | Type | Description |
|---|---|---|
| `type` | string | Suggestion type: `bulk_unread`, `large_sender`, `old_newsletters` |
| `title` | string | Short title of the suggestion |
| `description` | string | Detailed description with figures |
| `sender` | string | Concerned sender (if applicable) |
| `emailCount` | integer | Number of concerned emails |
| `totalSizeBytes` | integer | Total size of concerned emails |
| `query` | string | Gmail query to filter these emails |
| `isDismissed` | boolean | Whether the suggestion has been dismissed |

**Suggestion types**:
- **bulk_unread**: ≥ 20 unread emails from the same sender
- **large_sender**: Sender using > 10 MB with a clutter score ≥ 40
- **old_newsletters**: Newsletter with < 30% read rate and ≥ 5 emails

### PATCH /api/analytics/suggestions/:suggestionId/dismiss

Dismisses a suggestion (will no longer be displayed). `404` if it does not exist or does not belong to one of the user's accounts.

**Response**
```json
{ "ok": true }
```

**Authentication**: JWT

---

## Inbox Zero Tracker

### GET /api/analytics/:accountId/inbox-zero

Gmail inbox size now and over the last 30 days, and the days at zero in a row. Shown in the Overview (Gmail accounts). The scheduler records a snapshot every 6 hours (2 Gmail list calls); with no snapshot yet, this call records one.

**Response**
```json
{
  "current": {
    "inboxCount": 12,
    "unreadCount": 5
  },
  "history": [
    { "date": "2026-03-01", "inboxCount": 45, "unreadCount": 20 },
    { "date": "2026-03-02", "inboxCount": 30, "unreadCount": 12 },
    { "date": "2026-03-03", "inboxCount": 0, "unreadCount": 0 }
  ],
  "streak": 3,
  "bestStreak": 7
}
```

| Field | Type | Description |
|---|---|---|
| `current` | object | Current inbox state |
| `history` | array | History of the last 30 days (lowest inbox_count per day, `YYYY-MM-DD` UTC) |
| `streak` | integer | Consecutive days at inbox zero (0 emails in INBOX) |
| `bestStreak` | integer | Best historical streak |

**Authentication**: JWT + Gmail account ownership

---

## Technical data

### PostgreSQL tables

| Table | Content |
|---|---|
| `sender_scores` | Calculated clutter score per sender |
| `cleanup_suggestions` | Cleanup suggestions (dismissable) |
| `inbox_zero_snapshots` | Inbox snapshot history (every 6h) |

### Redis cache

| Key | TTL | Description |
|---|---|---|
| `analytics:cleanup:{accountId}` | 15 min | Cleanup suggestions |
| `analytics:inbox-zero:{accountId}` | 15 min | Inbox Zero data |

### Scheduler

The scheduler automatically records an Inbox Zero snapshot every 6 hours for all active Gmail accounts.
