# API — Archive Integrity

Verifies consistency between EML files on disk and the PostgreSQL index. Restricted to administrators.

---

## Run a check (synchronous)

### GET /api/integrity/check

**Auth**: JWT + `admin` role

**Query params**

| Param | Type | Description |
|---|---|---|
| `accountId` | `uuid` (optional) | Restrict the check to a specific Gmail account |

**Response**

```json
{
  "totalRecords": 12345,
  "checkedFiles": 12340,
  "missingFiles": ["account-uuid/2024/03/msg123.eml"],
  "orphanedFiles": ["account-uuid/2024/01/orphan.eml"],
  "corruptedFiles": ["account-uuid/2024/02/empty.eml"],
  "healthy": false
}
```

| Field | Description |
|---|---|
| `totalRecords` | Number of records in the `archived_mails` table |
| `checkedFiles` | Number of EML files checked |
| `missingFiles` | Files referenced in DB but missing from disk |
| `orphanedFiles` | EML files on disk without a DB record |
| `corruptedFiles` | Existing files that are empty (0 bytes) |
| `healthy` | `true` if no issues detected |

---

## Run a check (asynchronous)

### POST /api/integrity/check/async

Enqueues a BullMQ `integrity_check` job. Useful for large archives (avoids HTTP timeout).

**Auth**: JWT + `admin` role

**Response** `202 Accepted`

```json
{
  "jobId": "bullmq-job-id",
  "message": "Integrity check enqueued"
}
```

The result can be viewed on the **Jobs** page.

---

## Scheduled check

An automatic check is run daily at **3:00 AM** via the BullMQ scheduler. Results are visible in Jobs and trigger an `integrity.failed` webhook event if issues are found.
