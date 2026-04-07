# Admin API

Routes reserved for users with the `admin` role.  
All routes are prefixed with `/api/admin`.

---

## Global statistics

```http
GET /api/admin/stats
Authorization: Bearer <token_admin>
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
Authorization: Bearer <token_admin>
```

| Parameter | Type | Description |
|---|---|---|
| `page` | number | Page (default: 1) |
| `limit` | number | Results per page (default: 50, max: 100) |
| `search` | string | Search by email or name |

**Response:** paginated list with `gmail_accounts_count` and `storage_used_bytes` per user.

### User details

```http
GET /api/admin/users/:userId
Authorization: Bearer <token_admin>
```

**Response:** user details + list of their Gmail accounts + last 20 jobs.

### Update a user

```http
PATCH /api/admin/users/:userId
Authorization: Bearer <token_admin>
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
| `max_gmail_accounts` | number | Max Gmail accounts (1-50) |
| `storage_quota_bytes` | number | Archive storage quota (in bytes) |

---

## Jobs (global view)

```http
GET /api/admin/jobs?page=1&limit=50&status=failed
Authorization: Bearer <token_admin>
```

Returns jobs for **all users** with the associated user's email.

---

## Error codes

| Code | Description |
|---|---|
| 401 | Missing or invalid JWT token |
| 403 | User is not an admin |
| 404 | Resource not found |
