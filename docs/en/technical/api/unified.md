# API — Unified Inbox

Displays emails from **all Gmail accounts** of the user in a single timeline, sorted by descending date.

All routes require `Authorization: Bearer <token>`.

---

## Unified messages

### GET /api/unified/messages

Retrieves recent messages from all active Gmail accounts of the user, merges and sorts them by date.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Native Gmail query (applied to all accounts) |
| `maxResults` | number | Number of results per account (default: 20, max: 50) |

**Response 200**
```json
{
  "messages": [
    {
      "id": "abc123",
      "threadId": "def456",
      "subject": "Votre facture de mars",
      "from": "factures@exemple.com",
      "to": "vous@gmail.com",
      "date": "2026-03-01T10:00:00Z",
      "sizeEstimate": 45678,
      "snippet": "Retrouvez ci-joint votre facture...",
      "labelIds": ["INBOX", "UNREAD"],
      "hasAttachments": true,
      "accountId": "uuid-compte-1",
      "accountEmail": "perso@gmail.com"
    },
    {
      "id": "xyz789",
      "threadId": "uvw012",
      "subject": "Meeting demain",
      "from": "collegue@work.com",
      "date": "2026-03-01T09:30:00Z",
      "sizeEstimate": 2345,
      "snippet": "Salut, on se voit demain ?",
      "labelIds": ["INBOX"],
      "hasAttachments": false,
      "accountId": "uuid-compte-2",
      "accountEmail": "pro@gmail.com"
    }
  ],
  "accounts": [
    { "id": "uuid-compte-1", "email": "perso@gmail.com" },
    { "id": "uuid-compte-2", "email": "pro@gmail.com" }
  ]
}
```

::: info Additional fields
Each message carries two additional fields compared to the standard Gmail API:

- `accountId` — UUID of the source Gmail account
- `accountEmail` — Email address of the source account

This allows the frontend to display a colored tag per account and filter by account.
:::

---

## Behavior

### Parallel requests
Messages are fetched from **all active accounts** in parallel via `Promise.allSettled`. If an account fails (expired token, network error), messages from other accounts are still returned.

### Unified sorting
Messages from all accounts are merged then sorted by **descending date** to create a coherent timeline.

### Gmail API quota
Each account uses its own Gmail API quota. The unified view performs `listMessages` + `batchGetMessages` per account, respecting the per-account throttle (5 max concurrent requests, 1s between batches).

---

## Frontend usage

### Unified Inbox page (`/unified`)

- **Unified timeline** of all accounts, sorted by date
- **Colored tag** per account (stable color by index)
- **Filter by account** via a dropdown selector
- **Gmail search** applied to all accounts simultaneously
- **Read** an email via the existing `MailViewer` component (passes the `accountId` of the concerned email)
- **Prerequisite**: at least 2 connected Gmail accounts (otherwise an informational message is shown)

### Navigation

Accessible from the sidebar menu: **Email → Unified Inbox** (`/unified`).
