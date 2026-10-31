# API — Retention policies

Permanently deletes **archived** emails (EML and attachments) older than a given age, optionally limited to one account and one label. Emails in Gmail are not touched.

All routes require JWT authentication and only cover the user's own policies.

---

## List policies

### GET /api/retention

**Response 200**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "account_id": null,
    "name": "Archives > 2 years",
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

## Create a policy

### POST /api/retention

**Body**
```json
{
  "name": "Newsletters > 6 months",
  "gmailAccountId": "uuid",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 180
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Descriptive name of the policy |
| `gmailAccountId` | string | No | Target a specific account (all if omitted) |
| `label` | string | No | Target a Gmail label: its id, which must exist among the account's synced labels (one of the user's accounts if `gmailAccountId` is absent), otherwise `400` — see [labels.md](labels.md). Same check on `PUT`; `""` removes it |
| `maxAgeDays` | number | Yes | Maximum age in days (>= 1), compared to the email date |

**Response 201**: the created policy. **Response 400**: missing `name` or `maxAgeDays`, or unknown label.

---

## Update a policy

### PUT /api/retention/:policyId

**Body (partial)**
```json
{
  "name": "Newsletters > 3 months",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 90,
  "isActive": false
}
```

**Response 200**: the updated policy.

---

## Delete a policy

### DELETE /api/retention/:policyId

**Response 204** — No content

---

## Run now

### POST /api/retention/run

Immediately runs all of the user's active policies (synchronous).

**Response 200**
```json
{
  "policiesRun": 2,
  "totalDeleted": 47
}
```
