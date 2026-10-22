# API — Sharing archived emails

Temporary public links to an archived email (read-only). Encrypted emails cannot be viewed through a link.

---

## Create a link

### POST /api/shares 🔒

**Body**
```json
{ "archivedMailId": "uuid", "expiresInHours": 24, "maxAccess": 10 }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `archivedMailId` | uuid | Yes | Archived email belonging to one of the user's accounts |
| `expiresInHours` | number | No | 1 to 720 (30 days), default 24 |
| `maxAccess` | number | No | Maximum number of views (1 to 1000), unlimited if omitted |

**Response 201**
```json
{
  "id": "uuid",
  "archived_mail_id": "uuid",
  "user_id": "uuid",
  "token": "<64 hex characters>",
  "expires_at": "2026-03-21T10:00:00Z",
  "access_count": 0,
  "max_access": 10,
  "created_at": "2026-03-20T10:00:00Z",
  "subject": "Invoice March",
  "sender": "billing@example.com",
  "date": "2026-03-01T10:00:00Z"
}
```

::: warning
An unknown `archivedMailId`, or one owned by another user, currently makes the request fail with `500`.
:::

---

## List my links

### GET /api/shares 🔒

**Response 200** — the user's links, newest first (expired ones included):
```json
[
  {
    "id": "uuid", "archived_mail_id": "uuid", "token": "...", "expires_at": "...",
    "access_count": 3, "max_access": 10, "created_at": "...",
    "subject": "Invoice March", "sender": "billing@example.com", "date": "..."
  }
]
```

---

## Revoke a link

### DELETE /api/shares/:shareId 🔒

**Response 204** — No content. **Response 404**: link not found.

---

## View a shared email (public)

### GET /api/shares/public/:token

No authentication. Each successful view increments `access_count`.

**Response 200**
```json
{
  "subject": "Invoice March",
  "sender": "billing@example.com",
  "recipient": "you@gmail.com",
  "date": "2026-03-01T10:00:00Z",
  "snippet": "Please find attached...",
  "htmlBody": "<p>...</p>",
  "textBody": "..."
}
```

**Errors**

| Code | Description |
|---|---|
| 400 | Malformed token (64 hex characters expected) |
| 404 | Unknown, expired link, view limit reached, or encrypted email |
