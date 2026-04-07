# API — Webhooks

Allows receiving notifications on external services (Discord, Slack, Ntfy, or generic HTTP endpoint) when events occur in Nid.

---

## Supported events

| Event | Trigger |
|---|---|
| `job.completed` | A job completes successfully |
| `job.failed` | A job fails |
| `rule.executed` | An automatic rule executes |
| `quota.warning` | Quota alert (storage) |
| `integrity.failed` | Integrity check detects an issue |

---

## Webhook types

| Type | Format | Details |
|---|---|---|
| `generic` | Raw JSON | HMAC-SHA256 signature in the `X-Webhook-Signature` header |
| `discord` | Discord embeds | Green (success) or red (failure) color, limited to 2000 characters |
| `slack` | Text blocks | Slack Markdown format with code block |
| `ntfy` | Push notification | `Title`, `Priority`, `Tags` headers |

---

## List webhooks

### GET /api/webhooks

**Auth**: JWT

**Response**

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Notif Discord",
    "url": "https://discord.com/api/webhooks/...",
    "type": "discord",
    "events": ["job.completed", "job.failed"],
    "is_active": true,
    "secret": null,
    "last_triggered_at": "2024-03-15T12:00:00Z",
    "last_status": 200,
    "created_at": "2024-03-01T10:00:00Z"
  }
]
```

---

## Create a webhook

### POST /api/webhooks

**Auth**: JWT

**Body**

```json
{
  "name": "Notif Discord",
  "url": "https://discord.com/api/webhooks/...",
  "type": "discord",
  "events": ["job.completed", "job.failed"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Webhook name (1-100 characters) |
| `url` | `string` | ✅ | Target URL (must be a valid URL) |
| `type` | `string` | No | `generic` (default), `discord`, `slack`, `ntfy` |
| `events` | `string[]` | ✅ | At least one event from the list above |

**Response** `201 Created`

For the `generic` type, an HMAC `secret` is automatically generated and included in the response.

---

## Update a webhook

### PUT /api/webhooks/:webhookId

**Auth**: JWT

**Body**: same fields as creation (all optional).

---

## Enable / disable a webhook

### PATCH /api/webhooks/:webhookId/toggle

**Auth**: JWT

Toggles the webhook's `is_active` state.

---

## Delete a webhook

### DELETE /api/webhooks/:webhookId

**Auth**: JWT

**Response** `204 No Content`

---

## Test a webhook

### POST /api/webhooks/:webhookId/test

**Auth**: JWT

Sends a test `job.completed` event to the webhook to verify connectivity.

```json
{
  "success": true
}
```

---

## HMAC signature (generic type)

For `generic` type webhooks, each outgoing request contains an `X-Webhook-Signature` header computed with HMAC-SHA256 on the JSON body, using the webhook's `secret`.

Receiver-side verification (Node.js):

```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
const isValid = signature === req.headers['x-webhook-signature'];
```
