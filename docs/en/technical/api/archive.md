# API — Archives

---

## List archived emails

### GET /api/archive/:accountId/mails

**Query params**

| Param | Description |
|---|---|
| `q` | Full-text search (PostgreSQL tsvector) |
| `sender` | Filter by sender (ILIKE) |
| `from_date` | Start date (ISO 8601) |
| `to_date` | End date (ISO 8601) |
| `has_attachments` | Filter by attachment presence (`true` / `false`) |
| `page` | Page (default: 1) |
| `limit` | Results per page (default: 50) |

**Response**
```json
{
  "mails": [
    {
      "id": "uuid",
      "gmail_message_id": "abc123",
      "subject": "Facture mars 2024",
      "sender": "factures@exemple.com",
      "date": "2024-03-01T10:00:00Z",
      "size_bytes": 45678,
      "has_attachments": true,
      "label_ids": ["INBOX"],
      "archived_at": "2024-03-15T12:00:00Z"
    }
  ],
  "total": 4823,
  "page": 1,
  "limit": 50
}
```

---

## Read an archived email

### GET /api/archive/:accountId/mails/:mailId

Returns the email with its raw EML content and attachments.

```json
{
  "id": "uuid",
  "subject": "...",
  "emlContent": "From: ...\nTo: ...\n\nCorps du mail...",
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 123456,
      "file_path": "/archives/..."
    }
  ]
}
```

---

## Download an archived attachment

### GET /api/archive/:accountId/attachments/:attachmentId/download

Returns the file as a direct download (`Content-Disposition: attachment`).

---

## Trigger an archive

### POST /api/archive/:accountId/archive

Launches an asynchronous archiving job.

**Body**
```json
{
  "messageIds": ["id1", "id2"],
  "differential": true
}
```

Or via a Gmail query:

```json
{
  "query": "older_than:1y has:attachment",
  "differential": true
}
```

| Field | Description |
|---|---|
| `messageIds` | List of Gmail IDs to archive (optional if `query` is provided) |
| `query` | Native Gmail query — retrieves all matching IDs |
| `differential` | If `true` (default), skips already archived emails |

**Response 202**
```json
{ "jobId": "archive_mails-1234567890" }
```

---

## ZIP export

### POST /api/archive/:accountId/export-zip

Exports a selection of archived emails as a ZIP file (chunked streaming).

**Body**
```json
{
  "mailIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response 200** — ZIP file download (`Content-Type: application/zip`).

---

## Threads / Conversations

### List archived conversations

#### GET /api/archive/:accountId/threads

Returns archived emails grouped by `thread_id` (Gmail conversation). For each thread, the most recent email is returned with summary metadata.

**Query params**

| Param | Description |
|---|---|
| `q` | Full-text search (PostgreSQL tsvector) |
| `sender` | Filter by sender (ILIKE) |
| `from_date` | Start date (ISO 8601) |
| `to_date` | End date (ISO 8601) |
| `has_attachments` | Filter by attachment presence (`true` / `false`) |
| `page` | Page (default: 1) |
| `limit` | Results per page (default: 50) |

**Response 200**
```json
{
  "threads": [
    {
      "thread_id": "gmail-thread-id",
      "message_count": 5,
      "latest_date": "2026-03-20T14:30:00Z",
      "senders": ["alice@example.com", "bob@example.com"],
      "total_size": 234567,
      "has_attachments": true,
      "id": "uuid-latest-mail",
      "subject": "Re: Projet Q1",
      "sender": "alice@example.com",
      "snippet": "OK, on valide le budget...",
      "date": "2026-03-20T14:30:00Z",
      "archived_at": "2026-03-21T08:00:00Z"
    }
  ],
  "total": 342,
  "page": 1,
  "limit": 50
}
```

::: tip Thread summary fields
- `message_count` — Number of emails in the conversation
- `senders` — List of unique senders
- `total_size` — Combined size of all emails in the thread
- `latest_date` — Date of the most recent email
:::

---

### Read a full conversation

#### GET /api/archive/:accountId/threads/:threadId

Returns all emails in a thread, sorted by date ascending (chronological order), with their attachments.

**Response 200**
```json
[
  {
    "id": "uuid-mail-1",
    "gmail_message_id": "abc123",
    "thread_id": "gmail-thread-id",
    "subject": "Projet Q1",
    "sender": "bob@example.com",
    "recipient": "alice@example.com",
    "date": "2026-03-15T10:00:00Z",
    "size_bytes": 12345,
    "has_attachments": false,
    "in_reply_to": null,
    "references_header": null,
    "attachments": []
  },
  {
    "id": "uuid-mail-2",
    "gmail_message_id": "def456",
    "thread_id": "gmail-thread-id",
    "subject": "Re: Projet Q1",
    "sender": "alice@example.com",
    "date": "2026-03-20T14:30:00Z",
    "size_bytes": 45678,
    "has_attachments": true,
    "in_reply_to": "<abc123@mail.gmail.com>",
    "references_header": "<abc123@mail.gmail.com>",
    "attachments": [
      {
        "id": "uuid-att-1",
        "filename": "budget.xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size_bytes": 34567
      }
    ]
  }
]
```

---

## Frontend usage

### List / Conversations toggle

The Archives page features a `Segmented` selector to switch between:

- **List** — Default mode, paginated table view (existing)
- **Conversations** — Grouped by Gmail thread

### Conversations view

- Each conversation is displayed as a card showing: message count badge, subject, senders, total size, last message date
- **Click** on a conversation → inline expansion with the chronological email list
- Each email in the thread is clickable to open the full viewer (Drawer with HTML/EML)
- Progressive visual indentation to reflect conversation depth
- Manual pagination (previous / next)

### New archived fields

Archiving now extracts two additional headers from EML files:

- `in_reply_to` — `In-Reply-To` header (identifies the parent message)
- `references_header` — `References` header (complete conversation chain)
