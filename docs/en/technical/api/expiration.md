# API — Email expiration

Schedules moving a Gmail email to the trash at a given date (OTP codes, delivery tracking, promotions…). The scheduler processes due expirations every 15 minutes: emails are moved to the Gmail trash (active accounts only) and the expiration is marked `is_deleted`.

All routes require JWT + ownership of the Gmail account `:accountId`.

---

## List expirations

### GET /api/expiration/:accountId

Pending (unprocessed) expirations, sorted by expiration date ascending.

**Response 200**
```json
[
  {
    "id": "uuid",
    "gmail_account_id": "uuid",
    "gmail_message_id": "18c2f...",
    "subject": "Your verification code",
    "sender": "no-reply@service.com",
    "expires_at": "2026-03-21T10:00:00Z",
    "category": "otp",
    "is_deleted": false,
    "deleted_at": null,
    "created_at": "2026-03-20T10:00:00Z"
  }
]
```

---

## Statistics

### GET /api/expiration/:accountId/stats

**Response 200**
```json
{ "total": 40, "pending": 12, "deleted": 28, "expiringSoon": 3 }
```

`expiringSoon`: pending expirations due within 24 h.

---

## Create an expiration

### POST /api/expiration/:accountId

**Body**
```json
{
  "gmailMessageId": "18c2f...",
  "subject": "Your verification code",
  "sender": "no-reply@service.com",
  "expiresInDays": 1,
  "category": "otp"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `gmailMessageId` | string | Yes | Gmail message id |
| `subject` / `sender` | string | No | Kept for display |
| `expiresAt` | string | No | ISO expiration date; takes precedence over `expiresInDays` |
| `expiresInDays` | number | No | 1 to 365 (default: 7 if no date is given) |
| `category` | string | No | `manual` (default), `otp`, `delivery`, `promo` |

**Response 201**: the created expiration.

### POST /api/expiration/:accountId/batch

Creates several expirations in one request.

**Body**
```json
{ "items": [ { "gmailMessageId": "18c2f...", "expiresInDays": 14, "category": "delivery" } ] }
```

`items`: 1 to 100 items, same fields as the single creation.

**Response 201**: the list of created expirations (an email that already has an expiration is skipped).

---

## Detect temporary emails

### POST /api/expiration/:accountId/detect

Applies heuristics (subject, sender) to spot temporary emails. Creates nothing.

**Body**
```json
{
  "messages": [
    { "gmailMessageId": "18c2f...", "subject": "Your verification code", "sender": "no-reply@service.com" }
  ]
}
```

`messages`: 1 to 500 items.

**Response 200** — only recognized messages:
```json
[
  {
    "gmailMessageId": "18c2f...",
    "subject": "Your verification code",
    "sender": "no-reply@service.com",
    "category": "otp",
    "suggestedDays": 1
  }
]
```

| Category | Suggested delay |
|---|---|
| `otp` | 1 day |
| `delivery` | 14 days |
| `promo` | 7 days |

---

## Update the expiration date

### PATCH /api/expiration/:accountId/:expirationId

**Body**
```json
{ "expiresAt": "2026-03-25T10:00:00Z" }
```

**Response 200**: the updated expiration.

---

## Delete an expiration

### DELETE /api/expiration/:accountId/:expirationId

Cancels the expiration (the Gmail email is not touched).

**Response 204** — No content
