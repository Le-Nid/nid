# API — Gmail

All routes require `Authorization: Bearer <token>`.

`:accountId` = UUID of the Gmail account (retrieved via `GET /api/auth/me`).

---

## Profile

### GET /api/gmail/:accountId/profile

Returns the Gmail profile (email, message count, threads).

```json
{
  "emailAddress": "compte@gmail.com",
  "messagesTotal": 5234,
  "threadsTotal": 3102,
  "historyId": "123456"
}
```

---

## Messages

### GET /api/gmail/:accountId/messages

Paginated message list.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Native Gmail query (`from:`, `has:attachment`, `larger:1mb`, etc.) |
| `pageToken` | string | Pagination token (returned by the previous response) |
| `maxResults` | number | Number of results (default: 50, max: 500) |

**Response**
```json
{
  "messages": [{ "id": "abc123", "threadId": "def456" }],
  "nextPageToken": "token_page_suivante",
  "resultSizeEstimate": 5234
}
```

::: info Two levels of queries
`messages.list` returns only IDs. For full metadata (subject, sender, size), use `GET /messages/:id` or the dashboard stats which perform a batchGet.
:::

---

### GET /api/gmail/:accountId/messages/:messageId

Message metadata (headers only, lightweight).

```json
{
  "id": "abc123",
  "threadId": "def456",
  "subject": "Votre facture de mars",
  "from": "factures@exemple.com",
  "to": "vous@gmail.com",
  "date": "Mon, 01 Mar 2024 10:00:00 +0000",
  "sizeEstimate": 45678,
  "snippet": "Retrouvez ci-joint votre facture...",
  "labelIds": ["INBOX", "Label_123"],
  "hasAttachments": true
}
```

---

### GET /api/gmail/:accountId/messages/:messageId/full

Full message (Gmail API `full` format — payload, parts, attachments). Used for reading and archiving.

---

### POST /api/gmail/:accountId/messages/batch

Retrieves metadata for multiple messages in a single call. Avoids multiple individual calls and 429 errors.

**Body**
```json
{
  "ids": ["id1", "id2", "id3"]
}
```

| Field | Type | Description |
|---|---|---|
| `ids` | string[] | List of Gmail IDs (max: 100) |

**Response 200**
```json
[
  {
    "id": "id1",
    "subject": "Facture mars",
    "from": "factures@exemple.com",
    "date": "Mon, 01 Mar 2024 10:00:00 +0000",
    "sizeEstimate": 45678,
    "snippet": "Retrouvez ci-joint...",
    "labelIds": ["INBOX"],
    "hasAttachments": true
  }
]
```

---

### POST /api/gmail/:accountId/messages/bulk

Triggers an asynchronous bulk operation. Returns a `jobId` immediately.

**Body**
```json
{
  "action": "trash",
  "messageIds": ["id1", "id2", "id3"],
  "labelId": "Label_123",
  "delayMs": 10000
}
```

`delayMs`: Delay before the job runs (0–60000 ms, default `10000`). While it waits the job is `scheduled` and can be cancelled with `DELETE /api/jobs/:jobId` (undo). Send `0` to run immediately.

**Select all results (`query`)**: send `query` (a Gmail search string, e.g. `"from:news@example.com older_than:1y"`) **instead of** `messageIds`. Exactly one of the two is required (otherwise `400`); `query` cannot be empty.

```json
{ "action": "trash", "query": "from:news@example.com", "delayMs": 10000 }
```

The route does not list the messages: the job pages through Gmail search results (500 per page) and processes them page by page, so `total` and `progress` grow as pages are discovered. It stops after `BULK_QUERY_MAX` mails (default `50000`, see configuration): the job then ends `completed` with an `error` note saying the cap was reached, and notifies "Plafond atteint — N mails traités sur ~M — relancez l'action pour traiter la suite" with `data: { capped: true, jobId, query, action, labelId, processed, remainingEstimate }`. It is never relaunched automatically (label/mark actions would keep matching the query); `POST /api/jobs/:jobId/retry` runs it again. The audit log entry is written when the job ends, with the query and the real number of processed mails (`details.count`, `details.capped`); with `messageIds` it is written at enqueue time.

**Available actions**

| Action | Description |
|---|---|
| `trash` | Send to Gmail trash (recoverable for 30 days) |
| `delete` | Permanently delete ⚠️ irreversible |
| `archive` | Remove from INBOX (equivalent to the Gmail Archive button) |
| `label` | Add `labelId` to messages |
| `unlabel` | Remove `labelId` from messages |
| `mark_read` | Mark as read |
| `mark_unread` | Mark as unread |

**Response 202**
```json
{ "jobId": "bulk_operation-1234567890", "runAt": "2026-10-20T12:00:10.000Z", "message": "Job enqueued" }
```

---

## Labels

### GET /api/gmail/:accountId/labels

Lists all labels for the Gmail account.

### POST /api/gmail/:accountId/labels

Create a label.

```json
{ "name": "Mon Label" }
```

### DELETE /api/gmail/:accountId/labels/:labelId

Delete a label.
