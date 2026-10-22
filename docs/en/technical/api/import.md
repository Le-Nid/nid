# API — mbox Import / Export

Import emails into the Nid archives (mbox file or IMAP server) and export archives as mbox.

All routes require JWT + ownership of the Gmail account `:accountId` (imported emails are attached to that account).

---

## Import an mbox file

### POST /api/import/:accountId/mbox

Imports an mbox file (for example a Google Takeout export) into the archives. The file is uploaded as multipart (500 MB max) then processed by an `import_mbox` job.

**Content-Type:** `multipart/form-data`

**Body:** the `.mbox` file (first file field of the form, e.g. `file`).

**Response 202**
```json
{ "jobId": "import_mbox-<uuid>" }
```

**Errors**: `400` no file.

The job runs in the background. Track progress via `/api/jobs/:jobId/events` (see [jobs.md](jobs.md)).

---

## Import from an IMAP server

### POST /api/import/:accountId/imap

Starts an `import_imap` job.

**Body**
```json
{
  "host": "imap.outlook.com",
  "port": 993,
  "secure": true,
  "user": "user@outlook.com",
  "pass": "app_password",
  "folder": "INBOX",
  "maxMessages": 500
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `host` | string | Yes | IMAP server |
| `port` | number | No | Port (default: 993) |
| `secure` | boolean | No | TLS (default: `true`) |
| `user` | string | Yes | Username |
| `pass` | string | Yes | Password |
| `folder` | string | No | IMAP folder (default: `INBOX`) |
| `maxMessages` | number | No | Limits the number of imported emails |

**Response 202**
```json
{ "jobId": "import_imap-<uuid>" }
```

**Errors**: `400` missing `host`, `user` or `pass`.

::: info Credentials
The IMAP password is stripped from the payload stored in the database: an `import_imap` job cannot be replayed with `POST /api/jobs/:jobId/retry` (`409`), it must be started again from its page.
:::

---

## Export as mbox

### POST /api/import/:accountId/export-mbox

Exports the account's archives as mbox.

**Body (optional)**
```json
{ "mailIds": ["uuid1", "uuid2"] }
```

If `mailIds` is omitted, all archived emails of the account are exported.

**Response 200**: `application/mbox` file download (streaming).

```
Content-Type: application/mbox
Content-Disposition: attachment; filename="archive-export-2026-03-20.mbox"
Transfer-Encoding: chunked
```
