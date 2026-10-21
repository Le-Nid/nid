# API — Jobs

---

## List jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filter by status (`pending`, `scheduled`, `active`, `completed`, `failed`, `cancelled`) |
| `accountId` | Filter by Gmail account |

**Response**
```json
[
  {
    "id": "uuid",
    "bullmq_id": "bulk_operation-1234567890",
    "type": "bulk_operation",
    "status": "active",
    "progress": 45,
    "total": 200,
    "processed": 90,
    "gmail_account_id": "uuid",
    "payload": { "action": "trash", "messageIds": [...] },
    "error": null,
    "created_at": "2024-03-15T12:00:00Z",
    "completed_at": null
  }
]
```

---

## Job details

### GET /api/jobs/:jobId

Returns the job with its live BullMQ state.

```json
{
  "...": "champs de la table jobs",
  "bullmqState": "active"
}
```

---

## Cancel a job

### DELETE /api/jobs/:jobId

Removes the job from BullMQ and updates its status to `cancelled`. `:jobId` is the row `id` or the BullMQ id returned by the enqueue endpoints (`jobId`), so a `scheduled` (delayed) job can be cancelled before `runAt` (undo).

**Response 204** — No content

**Response 409** — the job is already `active` (running in the worker) and cannot be cancelled.

**Response 404** — unknown job or job owned by another user.
