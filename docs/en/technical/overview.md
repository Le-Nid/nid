# Architecture Overview

## General Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Ant Design + i18n)"]
        UI[Interface web :3000]
    end

    subgraph Backend["Backend (Fastify + TypeScript)"]
        API[API REST :4000]
        Workers[BullMQ Workers]
    end

    subgraph Storage["Stockage"]
        PG[(PostgreSQL\nMétadonnées + index)]
        Redis[(Redis\nQueue BullMQ)]
        NAS[📁 NAS\nArchives EML]
    end

    subgraph External["Externe"]
        Gmail[Gmail API\nOAuth2]
    end

    UI -->|HTTP + JWT| API
    API -->|OAuth2| Gmail
    API --> PG
    API --> Redis
    Workers --> PG
    Workers --> Redis
    Workers -->|Écriture EML| NAS
    Workers -->|Gmail API| Gmail
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

    UI->>API: POST /api/gmail/:id/messages/bulk
    API->>Queue: enqueueJob("bulk_operation", payload)
    API-->>UI: 202 Accepted {jobId}
    
    UI->>API: GET /api/jobs/events (SSE)
    loop Événements temps réel
        API-->>UI: SSE {jobId, status, progress, processed/total}
    end

    Queue->>Worker: Job dépilé
    loop Par batch de 100 (throttlé 500ms)
        Worker->>Gmail: messages.trash() / modify()
    end
    Worker->>API: Job completed
```

---

## Differential Archiving Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Worker as Archive Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    UI->>API: POST /api/archive/:id/archive {query, differential:true}
    API->>Worker: enqueueJob("archive_mails")
    
    Worker->>Gmail: messages.list(query) → IDs
    Worker->>PG: SELECT gmail_message_id WHERE account=... → IDs déjà archivés
    Note over Worker: Diff = nouveaux IDs seulement
    
    loop Pour chaque nouvel ID
        Worker->>Gmail: messages.get(id, format=raw)
        Worker->>NAS: Écriture {id}.eml
        Worker->>NAS: Écriture pièces jointes
        Worker->>PG: INSERT archived_mails + archived_attachments
    end
```

---

## Privacy Scan Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Privacy Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    Note over UI,NAS: Détection de pixels espions
    UI->>API: POST /api/privacy/:id/tracking/scan
    API->>Queue: enqueueJob("scan_tracking")
    API-->>UI: 202 {jobId}
    Queue->>Worker: Job dépilé
    loop Pour chaque message récent
        Worker->>Gmail: messages.get(id, format=full)
        Worker->>Worker: detectTrackingPixels(html)
        alt Trackers détectés
            Worker->>PG: INSERT tracking_pixels
        end
    end

    Note over UI,NAS: Scanner PII dans les archives
    UI->>API: POST /api/privacy/:id/pii/scan
    API->>Queue: enqueueJob("scan_pii")
    Queue->>Worker: Job dépilé
    loop Pour chaque EML archivé
        Worker->>NAS: Lecture fichier .eml
        Worker->>Worker: detectPii(contenu)
        alt PII détectées
            Worker->>PG: INSERT pii_findings
        end
    end

    Note over UI,NAS: Chiffrement des archives
    UI->>API: POST /api/privacy/:id/encryption/encrypt
    API->>Queue: enqueueJob("encrypt_archives")
    Queue->>Worker: Job dépilé
    loop Pour chaque EML non chiffré
        Worker->>NAS: Lecture → chiffrement AES-256-GCM → écriture
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

- Real-time progress (frontend polling)
- Error recovery (retry with exponential backoff)
- Cancellation of a running job
- Controlled concurrency (max 3 bulk jobs in parallel, 1 for archiving)

### PostgreSQL for Metadata

Archived email metadata (sender, subject, date, size) is indexed in PostgreSQL with a `tsvector` index for full-text search. This avoids parsing EML files for each search.

### At-Rest Encryption of Archives

EML archives can be encrypted on the NAS with AES-256-GCM. The key is derived from the user's passphrase via PBKDF2 (SHA-512, 100,000 iterations). The passphrase is never stored — only a scrypt verification hash is kept in the database.

Binary format of the encrypted file:

```
GMENC01 (7 B) | SALT (32 B) | IV (12 B) | AUTH_TAG (16 B) | CIPHERTEXT
```

This format allows on-the-fly decryption without temporary files, and immediate detection of an encrypted file (magic bytes `GMENC01`).
