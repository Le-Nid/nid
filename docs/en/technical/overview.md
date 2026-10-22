# Architecture Overview

## General Diagram

```mermaid
graph TB
    subgraph Container["nid container (unified Docker image)"]
        Nginx[Nginx :3000\nstatic frontend + /api proxy]
        subgraph Backend["Node backend (Fastify) :4000"]
            API[REST API + SSE]
            Worker[Unified BullMQ worker]
            Sched[Schedulers]
        end
    end

    UI[React 19 frontend\nshadcn/Tailwind + React Query] -->|HTTP + JWT cookie| Nginx
    Nginx --> API

    subgraph Storage["Storage"]
        PG[(PostgreSQL\nMetadata + indexes)]
        Redis[(Redis\nBullMQ queue + pub/sub)]
        NAS[📁 NAS\nEML archives]
    end

    subgraph External["External"]
        Gmail[Gmail API\nOAuth2]
    end

    API -->|OAuth2| Gmail
    API --> PG
    API --> Redis
    Sched -->|enqueueJob| Redis
    Worker --> PG
    Worker --> Redis
    Worker -->|Write EML| NAS
    Worker -->|Gmail API| Gmail
```

---

## Bulk Operation Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Worker
    participant Gmail as Gmail API

    UI->>API: POST /api/gmail/:accountId/messages/bulk {action, messageIds | query, delayMs}
    API->>Queue: enqueueJob("bulk_operation", payload, {delay: delayMs})
    API-->>UI: 202 Accepted {jobId, runAt}

    Note over UI,Queue: Undo window (10 s by default):<br/>DELETE /api/jobs/:jobId removes the job

    UI->>API: GET /api/jobs/:jobId/events (SSE)
    Queue->>Worker: Job picked up (after the delay)
    loop Per batch of 50 ids, or per page of 500 query results
        Worker->>Gmail: messages.trash() / batchModify()
        Worker-->>API: progress (QueueEvents)
        API-->>UI: SSE {status, progress, processed, total}
    end
    Worker-->>API: completed
    API-->>UI: SSE final state
```

---

## Differential Archiving Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Worker as Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    UI->>API: POST /api/archive/:accountId/archive {query, differential:true}
    API->>Worker: enqueueJob("archive_mails")

    Worker->>Gmail: messages.list(query) → IDs
    Worker->>PG: SELECT gmail_message_id WHERE account=... → already archived IDs
    Note over Worker: Diff = new IDs only

    loop For each new ID
        Worker->>Gmail: messages.get(id, format=raw)
        Worker->>NAS: Write {id}.eml
        Worker->>NAS: Write attachments
        Worker->>PG: INSERT archived_mails + archived_attachments
    end
    Note over Worker: More than BULK_QUERY_MAX new mails:<br/>differential follow-up re-enqueued after ARCHIVE_CONTINUE_DELAY_MIN
```

The same job runs the automatic NAS backup: the scheduler enqueues it for every account with `backup_enabled`, according to `backup_interval`.

---

## Archive Encryption Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Worker
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    UI->>API: POST /api/privacy/:accountId/encryption/encrypt
    API->>Queue: enqueueJob("encrypt_archives")
    Queue->>Worker: Job picked up
    loop For each unencrypted EML
        Worker->>NAS: Read → AES-256-GCM encryption → write
        Worker->>PG: UPDATE archived_mails SET is_encrypted=true
    end
```

---

## Architecture Decisions

### EML Rather Than mbox

The mbox format stores all emails in a single file per folder. This makes differentials complex (requires an external index) and makes archives fragile (a corrupted file = the entire folder lost).

EML (1 file per email) allows:

- Simple diff by comparing IDs in PostgreSQL
- Direct reading of an email without parsing the rest
- Corruption resistance
- Properly separated attachment storage

### BullMQ for All Long-Running Operations

Gmail API with 5,000 emails can potentially require several minutes of processing. Doing this synchronously over HTTP (30s timeout) is impossible.

BullMQ allows:

- Real-time progress (SSE fed by BullMQ `QueueEvents`)
- Error recovery (retry with exponential backoff)
- An undo window before execution (delayed jobs), and cancellation of a job that has not started
- Controlled concurrency (one unified worker, 3 jobs in parallel across all types)

See [Jobs & Queue](jobs.md).

### PostgreSQL for Metadata

Archived email metadata (sender, subject, date, size) is indexed in PostgreSQL with a `tsvector` index for full-text search. This avoids parsing EML files for each search.

### At-Rest Encryption of Archives

EML archives can be encrypted on the NAS with AES-256-GCM. The key is derived from the user's passphrase via PBKDF2 (SHA-512, 100,000 iterations). The passphrase is never stored — only a scrypt verification hash is kept in the database.

Binary format of the encrypted file:

```
GMENC01 (7 B) | SALT (32 B) | IV (12 B) | AUTH_TAG (16 B) | CIPHERTEXT
```

This format allows on-the-fly decryption without temporary files, and immediate detection of an encrypted file (magic bytes `GMENC01`).
