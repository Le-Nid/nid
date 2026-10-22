# First Steps

This guide walks you through your first minutes with Nid.

---

## Create your account

Open the app in your browser (default: [http://localhost:3000](http://localhost:3000)). The sign-in screen has two tabs: **Sign in** and **Create account**.

### Local account

1. Open the **Create account** tab
2. Enter your email and a password (8 characters minimum)
3. Confirm with **Create account**

### Sign in with a provider

If the administrator configured them, **Sign in with Google** buttons (or Microsoft, Discord, Facebook, LinkedIn, **Sign in via SSO**) appear under the form. Your name and avatar are fetched automatically.

::: tip Account merging
If you first create a local account and then sign in with Google using the same email, both accounts are automatically merged.
:::

If [2FA](settings.md#security) is on, a **Two-step verification** screen then asks for the 6-digit code from your authenticator app.

---

## Become an administrator

The first user must be promoted to administrator. Three options:

### Option A — Automatically (recommended)

Before creating your account, add the following to the `.env` file:

```bash
ADMIN_EMAIL=your@email.com
```

The user who signs up with this email automatically gets the admin role.

### Option B — In the database

If your account already exists:

```bash
docker compose exec postgres psql -U gmailmanager -d gmailmanager \
  -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

Log out and log back in for the new role to take effect.

### Option C — Via the interface

An existing administrator can change a user's **Role** from [Admin › Users](admin.md#users).

---

## Connect a Gmail account

As long as no Gmail account is connected, the Overview shows "No Gmail account connected" with the **Connect a Gmail account** link.

1. Go to **Settings › Gmail accounts** (on mobile: **More › Gmail accounts**)
2. Click **Add a Gmail account**
3. Allow access in the Google window (requested access: `gmail.modify`, `gmail.labels`)
4. Back in Nid, a message confirms "Gmail account connected: …"

::: warning Google warning screen
If your Google Cloud project is in "Testing" mode, a warning screen appears. Click **Advanced** → **Go to nid (unsafe)**. This is expected for personal self-hosted use.
:::

Repeat for other accounts, within the limit set by the administrator (shown as "N / max accounts"). Pick the active account in the sidebar's **Gmail Account** selector (on mobile: the avatar menu). Every page shows that account's data.

---

## Your first cleanup

1. Open **Cleanup** and click **Scan the mailbox**: Nid groups your newsletters and mailing-list mails by sender (the scan runs in the background, you can leave the page).
2. Sort by **Size** or **Never opened**.
3. On a sender, click **Delete all**: its mails go to the Gmail trash.
4. A toast "Deleting N emails in 10 s" appears with **Undo**: you have 10 seconds to change your mind.

Details are in [Cleanup](cleanup.md). To act on any Gmail search, see [Mail](mails.md).

::: tip Gmail trash
"Delete" moves mails to the **Gmail trash**, where Gmail keeps them 30 days before erasing them.
:::

---

## Your first NAS backup

1. In **Mail**, run a search (e.g. `older_than:1y`)
2. Click **Save all to the NAS** (or select mails then **Save to the NAS**)
3. Progress shows on the page and in [Activity](activity.md)

Saved mails end up in [Archives](archives.md), with full-text search. For regular backups, turn on the account's **Automatic backup** in [Settings › Gmail accounts](settings.md#gmail-accounts).

---

## What's next?

- [**Rules & labels**](rules.md) — automate sorting and cleanup
- [**Overview**](overview.md) — your account status and suggestions
- [**Settings**](settings.md) — 2FA, notifications, import/export
