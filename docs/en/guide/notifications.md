# Notifications and Webhooks

Nid keeps you informed of important events through in-app notifications and webhooks to your favorite services.

---

## In-App Notifications

### Notification Bell

The **🔔** icon in the navigation bar displays your notifications. The red badge indicates the number of unread notifications.

> 📸 *Suggested screenshot: notification bell with badge and dropdown panel showing notifications*

### Notification Actions

- Click a notification to mark it as read
- **Mark all as read**: marks all notifications as read
- **Delete**: deletes a notification individually
- **Delete read**: deletes all already-read notifications

### Notification Types

| Notification | Description |
|---|---|
| **Weekly report** | Summary of your email activity for the week |
| **Job completed** | A job (archiving, deletion, etc.) completed successfully |
| **Job failed** | A job failed after 3 attempts |
| **Rule executed** | An automatic rule was executed |
| **Quota alert** | Your storage quota is approaching its limit |
| **Integrity alert** | The archive integrity check detected an issue |

---

## Notification Preferences

Customize notification channels for each event type.

1. Go to **Settings** → **Notification Preferences** section
2. For each notification type, enable or disable channels:

| Channel | Description |
|---|---|
| 🔔 **In-app** | Creates a notification in the header bell |
| 💬 **Toast** | Displays a temporary pop-up at the bottom of the page |

> 📸 *Suggested screenshot: notification preferences table with in-app and toast toggles for each type*

Each toggle takes effect **immediately** — no need to save.

---

## Webhooks

Webhooks allow you to send notifications to external services when an event occurs in Nid.

### Supported Types

| Type | Description |
|---|---|
| **Discord** | Message in a Discord channel via webhook URL |
| **Slack** | Message in a Slack channel via Incoming Webhook |
| **Ntfy** | Push notification via [ntfy.sh](https://ntfy.sh) |
| **Generic** | HTTP POST request to any URL |

### Available Events

| Event | Description |
|---|---|
| `job.completed` | A job completed successfully |
| `job.failed` | A job failed |
| `rule.executed` | An automatic rule was executed |
| `quota.warning` | Storage quota is almost reached |
| `integrity.failed` | Integrity check detected an issue |

### Configure a Webhook

1. In **Settings** → **Webhooks** section
2. Click **Add a webhook**
3. Fill in:
    - **Name**: a free-form identifier (e.g., "Discord Notif")
    - **URL**: the webhook URL of your service
    - **Type**: Discord, Slack, Ntfy, or Generic
    - **Events**: check the events that trigger the webhook
    - **Username / Password** *(Ntfy only)*: credentials if the topic is protected by authentication

> 📸 *Suggested screenshot: webhook creation form with name, URL, type, and events fields*

### Test a Webhook

Click **Test** next to a webhook to send a test message and verify that the connection works.

### Enable / Disable

The toggle next to each webhook allows you to enable or disable it without deleting it.

### Security (Generic Webhooks)

**Generic** webhooks automatically include an `X-Webhook-Signature` header containing an HMAC-SHA256 of the payload. Your server can verify this signature to ensure the request actually comes from Nid.

> 📸 *Suggested screenshot: list of configured webhooks with name, type, events, active/inactive toggle, and test button columns*

---

## Usage Examples

### Discord

1. In Discord, create a webhook in a channel: **Channel Settings** → **Integrations** → **Webhooks** → **New Webhook**
2. Copy the webhook URL
3. In Nid, create a **Discord** type webhook with this URL
4. Select the events to be notified about

### Ntfy

[ntfy](https://ntfy.sh) allows you to receive push notifications on your phone or browser.

#### Public Topic (No Authentication)

1. Choose a topic on [ntfy.sh](https://ntfy.sh) (e.g., `nid-alerts`)
2. In Nid, create an **Ntfy** type webhook with the URL `https://ntfy.sh/nid-alerts`
3. Install the ntfy app on your phone and subscribe to the same topic

#### Protected Topic (With Login / Password)

If you host your own ntfy server or use a password-protected topic:

1. In Nid, create an **Ntfy** type webhook with your server's URL (e.g., `https://ntfy.example.com/my-topic`)
2. Enter the **username** and **password** in the fields that appear when the Ntfy type is selected
3. Credentials are sent via the `Authorization: Basic` HTTP header (Base64 encoding)
4. Click **Test** to verify that authentication works

::: tip Self-Hosted ntfy Server
If you use a self-hosted ntfy server with access control (`auth-default-access: deny-all`), you must create a user and grant them write access to the topic:
```bash
ntfy user add myuser
ntfy access myuser my-topic write
```
:::

::: warning Security
Ntfy credentials are stored in plain text in the database. Use a dedicated account with minimal permissions (write-only on the relevant topic).
:::
