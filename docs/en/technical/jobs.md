# Jobs & Queue (BullMQ)

## Why BullMQ

Gmail operations (bulk actions, archiving thousands of emails) can take several minutes. A synchronous HTTP request would inevitably time out.

BullMQ allows:

- Enqueuing the job → immediate `202 Accepted` response with a `jobId`
- Asynchronous execution in a worker
- Progress tracking over SSE
- Automatic retry on error (exponential backoff, 3 attempts)
- Cancelling a job as long as it has not started

---

## Job Types

`JobType` (`backend/src/jobs/queue.ts`). Every type is processed by the **unified worker** (`jobs/workers/unified.worker.ts`), which dispatches on `job.name`:

| Type | Enqueued by |
|---|---|
| `bulk_operation` | `POST /api/gmail/:accountId/messages/bulk` (ids or Gmail query); `POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete`; `runRule()` for Gmail actions |
| `archive_mails` | `POST /api/archive/:accountId/archive`; `runRule()` for the `archive_nas` action; scheduler (automatic NAS backup); the worker itself (follow-up of a capped backup) |
| `run_rule` | `POST /api/rules/:accountId/:ruleId/run`; scheduler (scheduled rules) |
| `scan_unsubscribe` | `POST /api/unsubscribe/:accountId/scan` |
| `integrity_check` | `POST /api/integrity/check/async` (admin); scheduler (daily, 3 AM) |
| `encrypt_archives` | `POST /api/privacy/:accountId/encryption/encrypt` |
| `import_mbox` | `POST /api/import/:accountId/mbox` |
| `import_imap` | `POST /api/import/:accountId/imap` |
| `purge_archive_trash` | scheduler (daily, 4 AM) |
| `backfill_body_text` | scheduler, once at startup if some archives still lack `body_text` |
| `apply_retention` | No caller at the moment: `POST /api/retention/run` applies the policies synchronously |

`POST /api/jobs/:jobId/retry` can re-enqueue any type (see [Retry](#retry)).

---

## Queue Configuration

```typescript
// Shared "nid" queue
defaultJobOptions: {
  attempts: 3,                                   // 3 attempts on failure
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
  removeOnComplete: { count: 100 },              // Keep the last 100 completed jobs
  removeOnFail: { count: 50 },                   // Keep the last 50 failed jobs
}
```

`enqueueJob(type, payload, opts)` takes two options:

- `dedupId`: while a job with this id is waiting or running, enqueueing it again is a no-op (scheduled rules, backups, backfill).
- `delay` (ms): the job stays `scheduled` (BullMQ `delayed`) until then and can still be cancelled.

Credentials in the payload (`passphrase`, `imapConfig.pass`) are stripped from the copy stored in the database; in Redis, such jobs are removed as soon as they end.

---

## Concurrency

The unified worker runs with a concurrency of **3** (at most 3 simultaneous jobs), shared by all types. Gmail calls are additionally limited per account (`gmail/gmail-throttle.ts`).

---

## Database Tracking

Each job is tracked in the `jobs` table (PostgreSQL) for:

- Persistence after restart (BullMQ Redis may be flushed)
- History access even after `removeOnComplete`
- Display in the frontend without a direct Redis dependency

### Pre-insertion

`enqueueJob()` immediately inserts a row in `jobs` (`status: 'pending'`, or `'scheduled'` with `delay`), unless BullMQ deduplicated the job. The frontend (SSE) therefore finds the job right away.

Handlers then perform an `UPDATE` (not an `INSERT`) to move the job to `active`, then `completed` or `failed`.

```
pending   → active → completed
scheduled ↗        → failed
pending / scheduled → cancelled (manual cancellation; 409 once active)
```

`GET /api/jobs` lists the user's jobs over the last 30 days (filters: comma-separated `status`, `accountId`, `limit`; `withCounts=true` adds per-status counts for the Activity page).

---

## Undo Window

Destructive actions are enqueued with `delay = delayMs` (request body, **10 s by default**, 0 to 60 s):

- `POST /api/gmail/:accountId/messages/bulk`
- `POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete`
- `POST /api/rules/:accountId/:ruleId/run`

The response contains the BullMQ `jobId` and `runAt`. During that delay, `DELETE /api/jobs/:jobId` (BullMQ id or row id) removes the job from the queue and marks the row `cancelled`. A job that is already `active` cannot be stopped: the route answers **409**. On the frontend, `UndoToast` shows the countdown.

---

## Retry

`POST /api/jobs/:jobId/retry` re-enqueues the stored payload under a new id (`retryOf` = original row id) and answers `202 { jobId, retryOf }`. Types whose credentials are not stored (`import_imap`, `encrypt_archives`) are refused with **409**: start them again from their page.

Capped bulk actions (`BULK_QUERY_MAX`, 50,000 by default) do not restart on their own: a notification offers to retry. Capped NAS backups, on the other hand, chain a differential follow-up after `ARCHIVE_CONTINUE_DELAY_MIN` minutes (15 by default), at most `ARCHIVE_CHAIN_MAX` times (20).

---

## Real-Time Tracking (SSE)

### Per job: `GET /api/jobs/:jobId/events`

- `:jobId` = BullMQ id or row id; the job must belong to the user (404 otherwise)
- Sends the current `jobs` row on connect; if the job is already finished, sends the final state then `event: close`
- The broadcaster (`startQueueEventBroadcaster`) listens to BullMQ `QueueEvents` (`progress`, `completed`, `failed`) and re-reads the `jobs` row (by `bullmq_id`) before broadcasting `{ status, progress, processed, total }`
- Heartbeat every 15 s
- Frontend: `useJobSSE(jobId)` (reconnects with backoff), rendered by `JobProgressInline`

### Per user: `GET /api/events`

Stream of the signed-in user, through one Redis pub/sub channel per user (`events/events.service.ts`):

- `counters` on connect and on every change: `{ mails, activeRules, activeJobs }`
- `job` when a job starts or finishes (published by the worker)
- Heartbeat every 30 s
- Frontend: `useLiveCounters()` (navigation badges)

End-of-job toasts come from `useGlobalJobNotifier` (polls active jobs every 5 s), and in-app notifications from `notify()` in the worker.

---

## Scheduler

`startRuleScheduler()` (`jobs/scheduler.ts`) runs every **60 seconds** inside the API process:

| Task | Frequency | Mode |
|---|---|---|
| `integrity_check` | Daily (3 AM tick) | Job |
| `purge_archive_trash` | Daily (4 AM tick) | Job |
| Automatic NAS backup (differential `archive_mails`) | Per `mail_accounts.backup_interval` (1h / 6h / 24h), active accounts with `backup_enabled` and no `auth_error_at` | Job, `dedupId: backup-<accountId>` |
| Scheduled rules (`run_rule`) | `hourly`, `daily`, `weekly`, `monthly` based on `rules.last_run_at` | Job, `dedupId: run_rule-<ruleId>` |
| `backfill_body_text` | Once at startup, if archives remain to fill | Job |
| Inbox Zero snapshots | Every 6 h | In-process |
| Gmail label sync (`syncAllLabels()`) | Daily (first tick after startup) | In-process — see [API — Labels](api/labels.md) |
| Expired emails (`processExpiredEmails()`) | Every 15 min | In-process |
| Expired share links (`cleanupExpiredShares()`) | Hourly | In-process |

`startReportScheduler()` (`reports/report.scheduler.ts`) checks hourly and, on Mondays, generates each user's weekly report as a notification.

### Archive Trash Purge

The `purge_archive_trash` job:

1. Reads configuration from the `system_config` table (`archive_trash_retention_days`, `archive_trash_purge_enabled`)
2. If disabled (`purge_enabled = false`), the job ends without action
3. Finds archived emails where `deleted_at < now - retention_days`
4. Deletes the associated files (EML + attachments) from storage
5. Deletes the database entries

The default retention is **30 days**. An admin can change it (`PUT /api/archive/config/trash`), or it can be edited directly in the `system_config` table.
