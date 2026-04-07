# API Ops & Resilience

## Storage (S3/MinIO)

### Prefix: `/api/storage`

All routes require JWT authentication.

---

### `GET /config`

Retrieves the user's storage configuration.

**Response:**
```json
{
  "id": "uuid",
  "type": "s3",
  "s3_endpoint": "https://minio.local:9000",
  "s3_region": "us-east-1",
  "s3_bucket": "nid-archives",
  "s3_force_path_style": true,
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

If no configuration exists:
```json
{ "type": "local" }
```

---

### `PUT /config`

Saves the storage configuration.

**Body:**
```json
{
  "type": "s3",
  "s3Endpoint": "https://minio.local:9000",
  "s3Region": "us-east-1",
  "s3Bucket": "nid-archives",
  "s3AccessKeyId": "myaccesskey",
  "s3SecretAccessKey": "mysecretkey",
  "s3ForcePathStyle": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"local"` \| `"s3"` | Yes | Storage type |
| `s3Endpoint` | string | If S3 | S3 server URL |
| `s3Region` | string | No | Region (default: `us-east-1`) |
| `s3Bucket` | string | No | Bucket name (default: `nid-archives`) |
| `s3AccessKeyId` | string | If S3 | Access Key ID |
| `s3SecretAccessKey` | string | If S3 | Secret Access Key |
| `s3ForcePathStyle` | boolean | No | Path-style (default: `true`) |

**Response (200):**
```json
{ "success": true }
```

---

### `POST /test-s3`

Tests the S3 connection with the provided credentials (writes then deletes a test file).

**Body:**
```json
{
  "endpoint": "https://minio.local:9000",
  "region": "us-east-1",
  "bucket": "nid-archives",
  "accessKeyId": "myaccesskey",
  "secretAccessKey": "mysecretkey",
  "forcePathStyle": true
}
```

**Response (success):**
```json
{ "success": true }
```

**Response (failure):**
```json
{ "success": false, "error": "The specified bucket does not exist" }
```

---

## Retention policies

### Prefix: `/api/retention`

All routes require JWT authentication.

---

### `GET /`

Lists the user's retention policies.

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "gmail_account_id": null,
    "name": "Archives > 2 ans",
    "label": null,
    "max_age_days": 730,
    "is_active": true,
    "last_run_at": "2026-03-20T02:00:00Z",
    "deleted_count": 142,
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-03-20T02:00:00Z"
  }
]
```

---

### `POST /`

Creates a new retention policy.

**Body:**
```json
{
  "name": "Newsletters > 6 mois",
  "gmailAccountId": "uuid",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 180
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Descriptive name for the policy |
| `gmailAccountId` | string | No | Target a specific account (all if omitted) |
| `label` | string | No | Target a specific Gmail label |
| `maxAgeDays` | number | Yes | Maximum age in days (>= 1) |

**Response (201):** the created policy.

---

### `PUT /:policyId`

Updates a retention policy.

**Body (partial):**
```json
{
  "name": "Newsletters > 3 mois",
  "maxAgeDays": 90,
  "isActive": false
}
```

**Response (200):** the updated policy.

---

### `DELETE /:policyId`

Deletes a retention policy.

**Response:** `204 No Content`

---

### `POST /run`

Immediately runs all active retention policies for the user.

**Response:**
```json
{
  "policiesRun": 2,
  "totalDeleted": 47
}
```

---

## Gmail API Quota

### Prefix: `/api/quota`

---

### `GET /:accountId`

Gmail API quota consumption statistics for an account.

**Auth:** JWT + account ownership.

**Response:**
```json
{
  "limits": {
    "perSecond": 250,
    "perMinute": 15000
  },
  "usage": {
    "lastMinute": {
      "units": 120,
      "calls": 24,
      "percentOfLimit": 1
    },
    "lastHour": {
      "units": 3450,
      "calls": 690
    },
    "last24h": {
      "units": 28700,
      "calls": 5740
    }
  },
  "topEndpoints": [
    { "endpoint": "messages.get", "units": 15000, "calls": 3000 },
    { "endpoint": "messages.list", "units": 8500, "calls": 1700 }
  ],
  "hourlyBreakdown": [
    { "hour": "2026-03-20T08:00:00Z", "units": 1200, "calls": 240 },
    { "hour": "2026-03-20T09:00:00Z", "units": 890, "calls": 178 }
  ]
}
```

---

### `POST /cleanup` *(admin only)*

Deletes quota tracking data older than 30 days.

**Auth:** JWT + admin role.

**Response:**
```json
{ "deleted": 15420 }
```

---

## Import / Export

### Prefix: `/api/import`

All routes require JWT + account ownership.

---

### `POST /:accountId/mbox`

Imports an mbox file into the archives. The file is uploaded as multipart.

**Content-Type:** `multipart/form-data`

**Body:** `.mbox` file in the `file` field.

**Response (202):**
```json
{ "jobId": "import_mbox-1711891234567" }
```

The job runs in the background. Track progress via the Jobs page or SSE.

---

### `POST /:accountId/imap`

Launches an import from an IMAP server.

**Body:**
```json
{
  "host": "imap.outlook.com",
  "port": 993,
  "secure": true,
  "user": "user@outlook.com",
  "pass": "mot_de_passe_application",
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

**Response (202):**
```json
{ "jobId": "import_imap-1711891234567" }
```

---

### `POST /:accountId/export-mbox`

Exports archives in mbox format.

**Body (optional):**
```json
{ "mailIds": ["uuid1", "uuid2"] }
```

If `mailIds` is omitted, all archived emails for the account are exported.

**Response:** binary `application/mbox` file as download (chunked transfer encoding).

**Response headers:**
```
Content-Type: application/mbox
Content-Disposition: attachment; filename="archive-export-2026-03-20.mbox"
Transfer-Encoding: chunked
```
