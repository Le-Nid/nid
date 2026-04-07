# Jobs & Queue (BullMQ)

## Why BullMQ

Operations on Gmail (bulk delete, archiving 5,000 emails) can take several minutes. A synchronous HTTP request would inevitably time out.

BullMQ allows:

- Enqueue the job → immediate `202 Accepted` response with a `jobId`
- Asynchronous execution in a worker
- Frontend polling on `/api/jobs/:id` for progress
- Automatic retry on error (exponential backoff, 3 attempts)
- Cancellation of a running job

---

## Job Types

All job types are handled by a **unified worker** (`unified.worker.ts`) that dispatches by `job.name`:

| Type | Trigger |
|---|---|
| `bulk_operation` | POST `/api/gmail/:id/messages/bulk` |
| `archive_mails` | POST `/api/archive/:id/archive` |
| `run_rule` | Manual or cron (from the Rules page) |
| `scan_unsubscribe` | POST `/api/unsubscribe/:id/scan` |
| `scan_tracking` | POST `/api/privacy/:id/tracking/scan` |
| `scan_pii` | POST `/api/privacy/:id/pii/scan` |
| `encrypt_archives` | POST `/api/privacy/:id/encryption/encrypt` |
| `import_mbox` | POST `/api/import/:id/mbox` |
| `import_imap` | POST `/api/import/:id/imap` |
| `apply_retention` | POST `/api/retention/run` |

---

## Queue Configuration

```typescript
// Queue partagée "nid"
defaultJobOptions: {
  attempts: 3,                              // 3 tentatives en cas d'échec
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
  removeOnComplete: { count: 100 },         // Garder les 100 derniers jobs complétés
  removeOnFail: { count: 50 },             // Garder les 50 derniers jobs en erreur
}
```

---

## Concurrency

The unified worker is configured with a concurrency of **3** (3 simultaneous jobs max). All job types share this concurrency.

---

## Database Tracking

Each job is tracked in the `jobs` table (PostgreSQL) for:

- Persistence after restart (BullMQ Redis can be flushed)
- History access even after `removeOnComplete`
- Frontend display without direct Redis dependency

### Pre-insertion

The `enqueueJob()` function immediately inserts a row in the `jobs` table with `status: 'pending'` as soon as the job is added to BullMQ. This ensures the frontend (SSE) can find the job in the database without delay, before the worker even picks it up.

Workers then perform an `UPDATE` (not an `INSERT`) to move the job to `active`, then `completed` or `failed`.

```
pending → active → completed
                → failed
         → cancelled (annulation manuelle)
```

---

## Real-Time Tracking (SSE)

Progress tracking uses **Server-Sent Events** via the `GET /api/jobs/events` endpoint:

- The `useJobSSE` hook opens a persistent SSE connection
- Each event contains `{ jobId, status, progress, processed, total }`
- The SSE broadcaster queries the database (via `bullmq_id`) on each progress event to retrieve the full job state
- The connection automatically reconnects on disconnection
- A `JobProgressModal` displays the progress bar in real time
- The `NotificationBell` component also receives events for toast notifications
