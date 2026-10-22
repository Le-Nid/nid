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

Last scan result (`POST …/scan`), read from cache (`newsletter_scans` table): no Gmail call. `scannedAt` is `null` until a scan has completed. Mailing-list senders without `List-Unsubscribe` are included with `unsubscribeUrl` and `unsubscribeMailto` set to `null`. Once a sender's mails are deleted, it is removed from the cache (no rescan).

**Response 200**
```json
{
  "scannedAt": "2026-10-20T08:00:00.000Z",
  "senders": [
    {
      "sender": "Newsletter <newsletter@example.com>",
      "email": "newsletter@example.com",
      "count": 42,
      "totalSizeBytes": 1234567,
      "unreadCount": 40,
      "unsubscribeUrl": "https://example.com/unsubscribe",
      "unsubscribeMailto": null,
      "latestDate": "2026-03-15T10:00:00Z",
      "sampleMessageIds": ["msg-1"]
    }
  ]
}
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
{ "permanent": false, "delayMs": 10000 }
```

| Field | Default | Description |
|---|---|---|
| `delayMs` | `10000` | Delay before the job runs (0–60000 ms, default `10000`). While it waits the job is `scheduled` and can be cancelled with `DELETE /api/jobs/:jobId` (undo). Send `0` to run immediately.
| `permanent` | `false` | `false` = trash, `true` = permanent deletion |

**Response 202**
```json
{ "jobId": "bulk_operation-456", "runAt": "2026-10-20T12:00:10.000Z", "count": 42 }
```

If Gmail has no email left from this sender: **response 200** `{ "deleted": 0 }` and the sender is removed from the cache.
