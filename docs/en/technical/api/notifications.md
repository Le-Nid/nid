# API — Notifications

In-app notification system to inform the user about events (reports, jobs, etc.).

---

## List notifications

### GET /api/notifications 🔒

Returns the authenticated user's notifications, paginated.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `20` | Results per page |
| `unread_only` | — | `1` or `true` to show only unread notifications |

**Response 200**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "weekly_report",
      "title": "Rapport hebdomadaire",
      "body": "142 mails reçus, 38 archivés cette semaine",
      "data": { "period": "2026-W13" },
      "is_read": false,
      "created_at": "2026-03-30T08:00:00Z"
    }
  ],
  "unreadCount": 3,
  "page": 1,
  "limit": 20
}
```

---

## Mark as read

### PATCH /api/notifications/:notificationId/read 🔒

Marks a notification as read.

**Response 200**
```json
{ "success": true }
```

---

## Mark all as read

### POST /api/notifications/read-all 🔒

Marks all of the user's notifications as read.

**Response 200**
```json
{ "updated": 5 }
```

---

## Delete a notification

### DELETE /api/notifications/:notificationId 🔒

Deletes a user's notification.

**Response 200**
```json
{ "ok": true }
```

---

## Delete all read notifications

### DELETE /api/notifications 🔒

Deletes all **already read** notifications for the user. Unread notifications are preserved.

**Response 200**
```json
{ "ok": true }
```

---

## UI access

Notifications are accessible via the **🔔** icon in the application header. The red badge shows the number of unread notifications.

Each notification has a 🗑️ button for individual deletion. A **"Delete read"** button allows purging all already-read notifications at once (with confirmation).

---

## Notification preferences

### GET /api/notifications/preferences 🔒

Returns the user's notification preferences. If no preferences are set, default values are returned.

**Response 200**

```json
{
  "weekly_report": true,
  "job_completed": true,
  "job_failed": true,
  "rule_executed": false,
  "quota_warning": true,
  "integrity_alert": true,
  "weekly_report_toast": false,
  "job_completed_toast": true,
  "job_failed_toast": true,
  "rule_executed_toast": false,
  "quota_warning_toast": false,
  "integrity_alert_toast": false
}
```

Each notification type has two independent channels:

| Preference | Default | Channel | Description |
|---|---|---|---|
| `weekly_report` | `true` | 🔔 In-app | Weekly report (every Monday) |
| `weekly_report_toast` | `false` | 💬 Toast | |
| `job_completed` | `true` | 🔔 In-app | When a job completes |
| `job_completed_toast` | `true` | 💬 Toast | |
| `job_failed` | `true` | 🔔 In-app | When a job fails |
| `job_failed_toast` | `true` | 💬 Toast | |
| `rule_executed` | `false` | 🔔 In-app | When a rule executes |
| `rule_executed_toast` | `false` | 💬 Toast | |
| `quota_warning` | `true` | 🔔 In-app | Storage alert |
| `quota_warning_toast` | `false` | 💬 Toast | |
| `integrity_alert` | `true` | 🔔 In-app | Integrity issue |
| `integrity_alert_toast` | `false` | 💬 Toast | |

---

### PUT /api/notifications/preferences 🔒

Updates one or more preferences. Only the provided keys are modified.

**Body**

```json
{
  "weekly_report": false,
  "job_completed_toast": false
}
```

**Response 200**

```json
{ "ok": true }
```

::: info Upsert
If the user has no preferences yet, a row is created with default values then updated.
:::

---

## Unified dispatcher

Each event (job completed, rule executed, weekly report…) goes through the `notify()` dispatcher which:

1. Checks the **in-app** preference → inserts into the `notifications` table if enabled
2. Triggers the **webhooks** configured for the corresponding event (Discord, Slack, Ntfy, generic)

The three channels (in-app, toast, webhook) are independent. The toast is handled on the frontend side via the `useGlobalJobNotifier` hook.

| Notification category | Webhook event |
|---|---|
| `job_completed` | `job.completed` |
| `job_failed` | `job.failed` |
| `rule_executed` | `rule.executed` |
| `quota_warning` | `quota.warning` |
| `integrity_alert` | `integrity.failed` |
| `weekly_report` | *(no dedicated webhook)* |
