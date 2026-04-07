# API — Configuration Export / Import

Export and import user rules and webhooks in JSON format. Useful for backing up configuration, transferring between instances, or sharing.

---

## Export configuration

### GET /api/config/export

**Auth**: JWT

Returns a JSON file containing all rules (by Gmail account) and all webhooks of the user.

**Response**

```json
{
  "version": "1.0",
  "exportedAt": "2024-03-15T12:00:00.000Z",
  "accounts": [
    {
      "email": "user@gmail.com",
      "rules": [
        {
          "name": "Nettoyer newsletters",
          "description": "Supprime les newsletters non lues > 30j",
          "conditions": [
            { "field": "from", "operator": "contains", "value": "newsletter@" }
          ],
          "action": { "type": "trash" },
          "schedule": "0 2 * * 0",
          "is_active": true
        }
      ]
    }
  ],
  "webhooks": [
    {
      "name": "Notif Discord",
      "url": "https://discord.com/api/webhooks/...",
      "type": "discord",
      "events": ["job.completed", "job.failed"],
      "is_active": true
    }
  ]
}
```

::: info Exported data
Only rule and webhook metadata is exported. OAuth tokens, HMAC secrets and personal data are **not** included.
:::

---

## Import configuration

### POST /api/config/import

**Auth**: JWT

Imports rules and webhooks from a previously exported JSON file.

**Body**: the export JSON (same format as the `/export` response).

**Behavior**

| Element | Import logic |
|---|---|
| Rules | Associated to the corresponding Gmail account by **email**. If the Gmail account does not exist for the user, the rules are skipped. |
| Webhooks | Created directly for the user. A new `secret` will be generated for `generic` type webhooks. |

**Response**

```json
{
  "rulesImported": 5,
  "webhooksImported": 2
}
```

::: warning Additive import
The import **adds** rules and webhooks without deleting existing ones. There may be duplicates if you import the same file multiple times.
:::
