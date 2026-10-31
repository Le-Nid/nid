# API — Jobs

---

## List jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filter by status, comma-separated list (`pending`, `scheduled`, `active`, `completed`, `failed`, `cancelled`) |
| `accountId` | Filter by Gmail account (UUID); omitted = all accounts |
| `limit` | Number of jobs (1–500, default 50) |
| `withCounts` | `true`: response is `{ jobs, counts }`, `counts` = jobs per status for the same account (`{ "failed": 1, ... }`) |

Only jobs from the last 30 days are returned.

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
    "account_id": "uuid",
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

---

## Retry a job

### POST /api/jobs/:jobId/retry

Enqueues the job's stored payload again under a **new** job id (the "Relancer" button, e.g. after a bulk action stopped at `BULK_QUERY_MAX`). `:jobId` is the row `id` or the BullMQ id. The new job belongs to the caller and its payload carries `retryOf` (row id of the original job). It runs immediately (no undo delay).

**Response 202**
```json
{ "jobId": "bulk_operation-<uuid>", "retryOf": "<row uuid>" }
```

**Response 404** — unknown job or job owned by another user.

**Response 409** — `import_imap` and `encrypt_archives`: their credentials are redacted from the stored payload, so they must be started again from their page.

---

## Job tracking (SSE)

### GET /api/jobs/:jobId/events

`text/event-stream` of the progress of one of the user's jobs. `:jobId` is the row `id` or the BullMQ id.

- On open: a `data:` message with the full job row.
- If the job is already `completed`, `failed` or `cancelled`: the final row, then a `close` event, and the stream closes.
- Then, on each BullMQ event: `data: { "bullmqId", "event": "progress", "status", "progress", "processed", "total" }`, `event: "completed"` (with `progress: 100`) or `event: "failed"` (with `error`).
- A `: heartbeat` comment every 15 s.

**Response 404** — unknown job or owned by another user.

---

## Live events

### GET /api/events

Authenticated `text/event-stream` for the signed-in user (sidebar counters, D6). Events:

| Event | When | Data |
|---|---|---|
| `counters` | on connect, after each job of the user starts or ends, after a rule is created/changed/deleted | `{ "mails": { "<accountId>": 48212 }, "activeRules": 3, "activeJobs": 1 }` |
| `job` | a job of the user starts or ends (before the matching `counters`) | `{ "jobId", "type", "accountId", "phase": "started" \| "finished", "failed" }` |

`mails` is Gmail's `messagesTotal` per active account (`null` if Gmail did not answer). `activeJobs` counts jobs with status `active`. There is no `cleanupBytes` yet: it needs a size scan of the mailbox. A `: heartbeat` comment is sent every 30 s. Events are published on Redis pub/sub (channel `nid:events:<userId>`), so the worker and the API may run in different processes; nothing is computed while the user has no open stream.

**Response 401** — no valid session.
