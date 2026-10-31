# API — Archives

All `/:accountId/...` routes require the JWT and ownership of the Gmail account (otherwise `403`).

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
| `label` | Gmail label id the email must carry (e.g. `INBOX`, `Label_12`) |
| `tag` | Nid tag the email must carry (see [Tags](#tags)) |
| `page` | Page (default: 1) |
| `limit` | Results per page (default: 50, max: 100) |

With `q`, results are sorted by relevance then date, and each email carries a `highlight` field (HTML excerpt with matched terms in `<mark>`). Trashed emails are excluded. `body_text`, `search_vector` and `eml_path` are never returned.

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
  "limit": 50,
  "tookMs": 12
}
```

`total`: total number of results; `tookMs`: search duration in milliseconds.

---

## Read an archived email

### GET /api/archive/:accountId/mails/:mailId

Returns the email columns (except `body_text` and `eml_path`), its body decoded from the EML (`html` and `text`, empty strings if the email is encrypted or unreadable) and its attachments. `404` if the email does not exist for this account.

```json
{
  "id": "uuid",
  "subject": "...",
  "html": "<p>Email body...</p>",
  "text": "Email body...",
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

Returns the file as a direct download (`Content-Disposition: attachment`). `404` if the attachment does not belong to this account.

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

With a `query`, one job saves at most `BULK_QUERY_MAX` new mails (already archived ones are skipped first). When it stops there, it enqueues a differential continuation (same account and query) delayed by `ARCHIVE_CONTINUE_DELAY_MIN` minutes (status `scheduled`, cancellable) and notifies "Sauvegarde partielle : N mails sauvegardés, la suite reprend automatiquement dans 15 min" (`data.capped`, `data.continuationJobId`). The chain stops when a run saved nothing new or after `ARCHIVE_CHAIN_MAX` continuations; the notification then asks to start the backup again.

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

**Response 200** — ZIP file download (`Content-Type: application/zip`). `400` if `mailIds` is empty.

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
| `limit` | Results per page (default: 50, max: 100) |

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

## Contacts

### GET /api/archive/:accountId/contacts

The archive's address book, computed on each call from the `From` and `To` headers (trash excluded, the account's own address excluded), addresses lower-cased. Sorted by number of exchanges, then last exchange.

| Param | Description |
|---|---|
| `q` | Filter on address or name (ILIKE) |
| `page`, `limit` | Pagination (default 50, max 100) |

```json
{
  "contacts": [{ "email": "bob@x.fr", "name": "Martin, Bob", "from_count": 12, "to_count": 3, "last_at": "2026-08-01T07:00:00Z" }],
  "total": 1, "page": 1, "limit": 50
}
```

`from_count`: archived emails it sent; `to_count`: archived emails it is a recipient of (`To`). `name`: one of the display names seen for that address, `null` if none. Cost: about 0.3 s per 100,000 archived emails.

---

## Tags

Nid's own tags on archived emails (`tags` column, returned in lists and details). Gmail never sees them, and archiving the same email again keeps them. A tag is 1 to 50 characters, without a comma.

### GET /api/archive/:accountId/tags

The account's tags with their email count (trash excluded), in alphabetical order.

```json
[{ "tag": "taxes", "count": 12 }, { "tag": "energy", "count": 3 }]
```

### POST /api/archive/:accountId/mails/tags

Adds and/or removes tags on archived emails.

```json
{ "mailIds": ["uuid-1", "uuid-2"], "add": ["taxes"], "remove": ["to sort"] }
```

`mailIds`: 1 to 500 UUIDs; `add` and `remove`: at most 20 tags each. Response: `{ "updated": 2 }`.

### DELETE /api/archive/:accountId/tags/:tag

Removes the tag from every email of the account, trash included; the emails stay. Response: `{ "updated": 12 }`.

---

## Archive trash

Deleted archived emails first go to a trash (`deleted_at` set); they are excluded from lists, threads and searches, then purged after `retentionDays` days when automatic purge is enabled.

### POST /api/archive/:accountId/mails/trash

Moves archived emails to the trash.

**Body**
```json
{ "mailIds": ["uuid-1", "uuid-2"] }
```

`mailIds`: 1 to 500 UUIDs.

**Response 200**
```json
{ "trashed": 2 }
```

### POST /api/archive/:accountId/mails/restore

Restores emails from the trash. Same body as `/mails/trash`.

**Response 200**
```json
{ "restored": 2 }
```

### GET /api/archive/:accountId/trash

Paginated trash list, sorted by deletion date descending. Query: `q` (full-text), `page`, `limit` (default 50, max 100).

**Response 200**
```json
{ "mails": [ { "id": "uuid", "subject": "...", "deleted_at": "..." } ], "total": 12, "page": 1, "limit": 50, "retentionDays": 30 }
```

### DELETE /api/archive/:accountId/trash

Empties the trash: permanent deletion of the emails (EML and attachments).

**Response 200**
```json
{ "deleted": 12 }
```

### GET /api/archive/config/trash

Trash settings (any authenticated user).

**Response 200**
```json
{ "retentionDays": 30, "purgeEnabled": true }
```

### PUT /api/archive/config/trash

Updates the trash settings for the whole instance. **Admin only.**

**Body** (optional fields)
```json
{ "retentionDays": 30, "purgeEnabled": true }
```

`retentionDays`: 1 to 365.

**Response 200**
```json
{ "ok": true }
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
