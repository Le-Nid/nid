# API — Audit Log

Activity log tracking sensitive actions for each user.

---

## List logs

### GET /api/audit 🔒

Returns audit logs for the authenticated user, paginated and sorted by descending date.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `20` | Number of results per page |
| `action` | *(all)* | Filter by action type |

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "user.login",
      "target_type": null,
      "target_id": null,
      "details": { "ipAddress": "192.168.1.1" },
      "ip_address": "192.168.1.1",
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## Tracked actions

| Action | Trigger |
|---|---|
| `user.register` | User registration |
| `user.login` | Password login |
| `user.login_sso` | Google SSO login |
| `user.2fa_enable` | 2FA activation |
| `user.2fa_disable` | 2FA deactivation |
| `rule.create` | Rule creation |
| `rule.create_from_template` | Rule creation from template |
| `rule.update` | Rule modification |
| `rule.delete` | Rule deletion |
| `rule.toggle` | Rule enable/disable |
| `rule.run` | Manual rule execution |
| `bulk.trash` | Bulk operation: move to trash |
| `bulk.delete` | Bulk operation: delete |
| `bulk.archive` | Bulk operation: archive |
| `bulk.label` | Bulk operation: add label |
| `bulk.mark_read` | Bulk operation: mark as read |

::: info Fail-safe
Audit log writing is fail-safe: a write error is logged to the console but never blocks the main action.
:::
