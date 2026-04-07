# API — Jobs

---

## List jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filter by status (`pending`, `active`, `completed`, `failed`, `cancelled`) |
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

Cancels the job in BullMQ and updates its status to `cancelled`.

**Response 204** — No content

!!! note
    An `active` job (already running in the worker) cannot be stopped immediately. Cancellation takes effect between two batches.
