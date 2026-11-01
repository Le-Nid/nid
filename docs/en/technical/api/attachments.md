# API — Attachments

Centralized attachment management: NAS archives and live Gmail.

---

## Archived attachments

### GET /api/attachments/:accountId/archived 🔒

Lists attachments from archived emails with pagination, sorting and search.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `50` | Results per page (max 100) |
| `sort` | `size` | Sort by: `size` or `date` |
| `order` | `desc` | Order: `asc` or `desc` |
| `q` | — | Search in filename, subject, sender (ILIKE) and in the text of PDF/DOCX (`websearch_to_tsquery`, GIN index of migration 023); with `q`, each attachment carries `highlight`: HTML excerpt (`<mark>` only) when its text matches, else `null` |

**Response 200**
```json
{
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture-mars-2026.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 245000,
      "file_path": "/archives/...",
      "mail_subject": "Votre facture",
      "mail_sender": "billing@service.com",
      "mail_date": "2026-03-01T10:00:00Z",
      "gmail_message_id": "msg-123",
      "archived_mail_id": "uuid"
    }
  ],
  "total": 156,
  "totalSizeBytes": 52428800,
  "page": 1,
  "limit": 50
}
```

---

## Live Gmail attachments

### GET /api/attachments/:accountId/live 🔒

Scans Gmail messages with attachments (> 100 KB) directly via the Gmail API.

**Query params**

| Param | Default | Description |
|---|---|---|
| `maxResults` | `200` | Maximum number of messages to scan (max 500) |

**Response 200**
```json
{
  "attachments": [
    {
      "messageId": "msg-456",
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 1500000,
      "mailSubject": "Vacances",
      "mailSender": "ami@gmail.com",
      "mailDate": "2026-02-15",
      "mailSizeEstimate": 1600000
    }
  ],
  "totalSizeBytes": 45000000
}
```

::: info Gmail API Throttling
The live scan respects Gmail API quotas: metadata is read in batches of 25 messages (`GMAIL_BATCH_SIZE`) with a 1 s pause (`GMAIL_THROTTLE_MS`) between batches.
:::

---

## Download

### GET /api/attachments/:accountId/archived/:attachmentId/download 🔒

Downloads an archived attachment. `?inline=1` displays it in the browser, only for PNG, JPEG, GIF, WebP and PDF (other types, including SVG and HTML, are always served as `attachment`). Response with `X-Content-Type-Options: nosniff` (and a `sandbox` CSP for inline images).

**Errors**: `404` unknown attachment for this account or file missing from disk.

### GET /api/attachments/:accountId/live/:messageId/download 🔒

Downloads an attachment straight from Gmail.

| Param | Description |
|---|---|
| `filename` | **Required**: file name in the message |
| `inline` | `1`: inline display (same allowed types as above) |

**Errors**: `400` missing `filename`; `404` attachment not found in the message.

---

## Deduplication

Archived attachments are identified by their SHA-256 fingerprint (`content_hash`); identical files are stored only once per account, whatever the mail came from (Gmail backup, IMAP account, mbox / .eml import). `dedup-backfill` handles attachments archived before this rule.

### GET /api/attachments/dedup-stats 🔒

Deduplication statistics across all the user's accounts. `hashCoverage`: share of attachments already hashed (0 to 1).

**Response 200**
```json
{
  "totalAttachments": 1200,
  "uniqueFiles": 950,
  "duplicateFiles": 250,
  "totalSizeBytes": 524288000,
  "deduplicatedSizeBytes": 419430400,
  "savedBytes": 104857600,
  "hashCoverage": 1
}
```

### POST /api/attachments/dedup-backfill 🔒

Computes the fingerprint of archived attachments that have none yet, then merges duplicates (synchronous).

**Response 200**
```json
{ "processed": 120, "failed": 0, "duplicatesRemoved": 15 }
```
