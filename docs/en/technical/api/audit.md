# API — Audit Log

Activity log tracking sensitive actions for each user. The instance-wide log is available to admins through [`GET /api/admin/audit`](admin.md#instance-audit-log).

---

## List logs

### GET /api/audit 🔒

Returns audit logs for the authenticated user, paginated and sorted by descending date.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `50` | Results per page (max 100) |
| `action` | *(all)* | Filter by action type |

**Response 200**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "user.login",
      "target_type": null,
      "target_id": null,
      "details": null,
      "ip_address": "192.168.1.1",
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

`total` counts all of the user's logs, ignoring the `action` filter.

---

## Tracked actions

| Action | Trigger |
|---|---|
| `user.register` | User registration |
| `user.login` | Password login |
| `user.login_sso` | Google SSO login |
| `user.login_social` | Social provider login (`details.provider`) |
| `user.2fa_enable` | 2FA activation |
| `user.2fa_disable` | 2FA deactivation |
| `user.password_change` | Password change |
| `user.export_data` | GDPR data export |
| `admin.reset_password` | Password reset by an admin |
| `admin.delete_user` | User deleted by an admin |
| `rule.create_from_template` | Rule creation from template |
| `bulk.trash` | Bulk operation: move to trash |
| `bulk.archive` | Bulk operation: archive |
| `bulk.label` | Bulk operation: labels and read / unread (`details.action`) |
| `admin.empty_archive_trash` | An admin empties the instance archive trash |

Bulk operations by `messageIds` are logged when enqueued; those by `query` when the job ends, with the real number of processed emails.

::: info Fail-safe
Audit log writing is fail-safe: a write error is logged to the console but never blocks the main action.
:::
