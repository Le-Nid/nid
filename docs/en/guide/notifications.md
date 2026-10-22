# Notifications and webhooks

Nid tells you about important events in three ways: the header **bell**, **toasts** (temporary messages on screen) and **webhooks** to your services. Settings are in **Settings › Notifications & webhooks**.

---

## Notification bell

The bell, at the top right of every page, shows the number of unread notifications. It opens a panel with the latest notifications:

- clicking a notification marks it as read;
- **Mark all as read**;
- **Clear read**: after confirmation, permanently deletes read notifications;
- a row's delete button deletes that notification.

---

## Notification preferences

In **Settings › Notifications & webhooks**, each event has two switches: **In-app** (in the bell) and **Toast** (a temporary message on screen). Each change is saved immediately.

| Event | When |
|---|---|
| **Weekly report** | activity summary every Monday |
| **Task completed** | a task (bulk action, backup, rule) ends |
| **Task failed** | a task fails |
| **Rule run** | an automatic rule runs |
| **Storage alert** | archive storage nears its limit |
| **Integrity alert** | a problem is found in the archives |

---

## Webhooks

"Sends events to Discord, Slack, ntfy or your own URL (HMAC signed)."

### Create a webhook

**New webhook** opens the form:

- **Name**;
- **URL**;
- **Type**: **Generic (HMAC)**, **Discord**, **Slack**, **ntfy**;
- for ntfy: **ntfy user (optional)** and **ntfy password (optional)**;
- **Events** (at least one):

| Event | Matching preference |
|---|---|
| `job.completed` | Task completed |
| `job.failed` | Task failed |
| `rule.executed` | Rule run |
| `quota.warning` | Storage alert |
| `integrity.failed` | Integrity alert |

The weekly report is not sent by webhook.

### Manage webhooks

Each webhook in the list shows its type and the status code of the last call ("last call: 200"). A switch turns it on or off without deleting it. Its menu offers **Send a test** and **Delete** (after confirmation).

### Signature (Generic type)

**Generic (HMAC)** webhooks add an `X-Webhook-Signature: sha256=…` header, an HMAC-SHA256 of the request body. Your server can check it to make sure the request comes from Nid.

---

## Examples

### Discord

1. In Discord: **Channel settings** → **Integrations** → **Webhooks** → **New webhook**, then copy the URL
2. In Nid, create a **Discord** webhook with that URL and pick the events

### ntfy

[ntfy](https://ntfy.sh) sends push notifications to your phone or browser.

- **Public topic**: create an **ntfy** webhook with the URL `https://ntfy.sh/nid-alerts`, then subscribe to the same topic in the ntfy app.
- **Protected topic** (self-hosted ntfy server, for instance): enter your server URL (`https://ntfy.example.com/my-topic`) and the user / password fields; they are sent as `Authorization: Basic`. **Send a test** checks the authentication.

::: tip Self-hosted ntfy server
With access control (`auth-default-access: deny-all`), create a user and give it write access to the topic:
```bash
ntfy user add myuser
ntfy access myuser my-topic write
```
:::

::: warning Security
ntfy credentials are stored in plain text in the database. Use a dedicated account with minimal permissions (write-only on the relevant topic).
:::
