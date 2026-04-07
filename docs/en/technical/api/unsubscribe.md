# API — Unsubscribe (Newsletters)

Newsletter and mailing list management via `List-Unsubscribe` headers.

---

## Scan newsletters

### POST /api/unsubscribe/:accountId/scan 🔒

Launches an asynchronous scan of `List-Unsubscribe` headers in the account's emails.

**Response 202**
```json
{ "jobId": "scan_unsubscribe-123", "message": "Scan enqueued" }
```

---

### GET /api/unsubscribe/:accountId/newsletters 🔒

Synchronous scan (for smaller mailboxes). Returns the list of detected newsletters directly.

**Response 200**
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

## List messages from a sender

### GET /api/unsubscribe/:accountId/newsletters/:senderEmail/messages 🔒

Retrieves all message IDs from a given newsletter sender.

**Response 200**
```json
{
  "messageIds": ["msg-1", "msg-2", "msg-3"],
  "count": 3
}
```

---

## Delete newsletter emails

### POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete 🔒

Bulk deletes all emails from a newsletter sender (via BullMQ job).

**Body**
```json
{ "permanent": false }
```

| Field | Default | Description |
|---|---|---|
| `permanent` | `false` | `false` = trash, `true` = permanent deletion |

**Response 202**
```json
{ "jobId": "bulk_operation-456", "count": 42 }
```
