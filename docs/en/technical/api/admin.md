# Admin API

Routes reserved for users with the `admin` role (JWT in cookie or `Authorization: Bearer` header).  
All routes are prefixed with `/api/admin`.

---

## Global statistics

```http
GET /api/admin/stats
```

**Response:**
```json
{
  "users": 12,
  "gmailAccounts": 28,
  "jobs": { "total": 150, "completed": 140, "failed": 5, "active": 2 },
  "archives": { "totalMails": 5230, "totalSizeBytes": 2147483648 }
}
```

---

## Users

### List users

```http
GET /api/admin/users?page=1&limit=50&search=john
```

| Parameter | Type | Description |
|---|---|---|
| `page` | number | Page (default: 1) |
| `limit` | number | Results per page (default: 50, max: 100) |
| `search` | string | Search by email or name |

**Response:**
```json
{
  "users": [
    {
      "id": "uuid", "email": "john@example.com", "role": "user", "display_name": "John",
      "avatar_url": null, "is_active": true, "max_gmail_accounts": 3,
      "storage_quota_bytes": 5368709120, "last_login_at": "...", "created_at": "...",
      "gmail_accounts_count": 2, "storage_used_bytes": 1073741824
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

`total` takes `search` into account.

### User details

```http
GET /api/admin/users/:userId
```

**Response:** `{ "user": {...}, "gmailAccounts": [{ "id", "email", "is_active", "created_at" }], "recentJobs": [...] }` (last 20 jobs). `404` if the user does not exist.

### Update a user

```http
PATCH /api/admin/users/:userId
Content-Type: application/json
```

```json
{
  "role": "admin",
  "is_active": true,
  "max_gmail_accounts": 5,
  "storage_quota_bytes": 10737418240
}
```

| Field | Type | Description |
|---|---|---|
| `role` | `"admin"` \| `"user"` | User role |
| `is_active` | boolean | Enable/disable the account |
| `max_gmail_accounts` | number | Max number of Gmail accounts (1-50) |
| `storage_quota_bytes` | number | Archive storage quota (in bytes) |

**Response:** `{ "id", "email", "role", "is_active", "max_gmail_accounts", "storage_quota_bytes" }`. `400` if no field, `404` if the user does not exist.

### Reset a password

```http
POST /api/admin/users/:userId/password
Content-Type: application/json
```

```json
{ "password": "temporary-at-least-8-chars" }
```

Replaces the password, revokes every session of the user and removes their passkeys (a passkey added from a stolen session does not survive the account recovery). Logged as `admin.reset_password`. **Response 204**, `404` if the user does not exist.

### Delete a user

```http
DELETE /api/admin/users/:userId
```

Permanent deletion (Gmail accounts, archives in the DB and on disk, rules…). Logged as `admin.delete_user` (email in `details`). **Response 204**. `400` on one's own account (use `DELETE /api/auth/me`), `404` if unknown, `409` for the last active admin.

---

## Jobs (global view)

```http
GET /api/admin/jobs?page=1&limit=50&status=failed
```

Returns jobs of **all users** with the associated user's email (`user_email`).

**Response:** `{ "jobs": [...], "total": 150, "page": 1, "limit": 50 }` (`total` = total number of jobs, unfiltered).

---

## Instance Gmail API quota

```http
GET /api/admin/quota
```

**Response:**
```json
{
  "day": { "units": 125000, "calls": 25000, "limit": 1000000000 },
  "peakPerSecond": { "units": 120, "account": "account@gmail.com", "limit": 250 },
  "rateLimited24h": 3
}
```

- `day`: units consumed since midnight UTC.
- `peakPerSecond`: busiest second of the day for one mailbox (Gmail limit 250 units / user / second).
- `rateLimited24h`: rate-limited Gmail responses (429 / rateLimitExceeded) retried over 24 h.

---

## Instance audit log

```http
GET /api/admin/audit?user=john&action=user.login&page=1&limit=50
```

| Parameter | Description |
|---|---|
| `user` | Filter on the user's email (ILIKE) |
| `action` | Exact action (e.g. `user.login`) |
| `page` / `limit` | Pagination (default 50, max 100) |

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid", "user_id": "uuid", "user_email": "john@example.com", "action": "user.login",
      "target_type": null, "target_id": null, "details": null, "created_at": "..."
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "actions": ["admin.empty_archive_trash", "user.login"]
}
```

`actions`: list of actions present in the log (filter choices).

---

## System

```http
GET /api/admin/system
```

State of the instance archive trash and last integrity check.

**Response:**
```json
{
  "trash": { "count": 42, "sizeBytes": 1234567, "retentionDays": 30, "purgeEnabled": true, "nextPurgeAt": "..." },
  "integrity": {
    "checkedAt": "...", "checkedFiles": 5230, "missing": 0, "corrupted": 0, "orphaned": 0, "healthy": true
  }
}
```

`integrity` is `null` if no check has run yet; `nextPurgeAt` is `null` if the purge is disabled or the trash is empty.

---

## Empty the archive trash

```http
DELETE /api/admin/archive-trash
```

Permanently deletes the trashed archived emails of **all accounts**. Logged in the audit (`admin.empty_archive_trash`).

**Response:**
```json
{ "deleted": 42, "sizeBytes": 1234567 }
```

---

## Error codes

| Code | Description |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | The user is not an admin |
| 404 | Resource not found |
