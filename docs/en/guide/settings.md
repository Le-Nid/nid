# Settings

**Settings** (`/settings/…`) is split into five sections, as tabs on desktop and listed in the **More** page on mobile:

| Section | Address |
|---|---|
| [Account](#account) | `/settings/account` |
| [Security](#security) | `/settings/security` |
| [Gmail accounts](#gmail-accounts) | `/settings/gmail` |
| [Notifications & webhooks](#notifications-webhooks) | `/settings/notifications` |
| [Data](#data) | `/settings/data` |
| [About](#about) | `/settings/about` |

---

## Account

- **Profile**: avatar, name, email, and the space used by your archives ("Archives: X used of Y", quota set by the administrator).
- **Language and appearance**: **Language** (French / English) and **Theme** (**System**, **Light**, **Dark**). Language and dark mode are also in the avatar menu.
- **Reading**:
  - **Show remote images**: off by default, since these images are often used to know when you open a mail. A "Show" button stays available in each mail.
  - **Single-key keyboard shortcuts**: turns on the [Mail shortcuts](mails.md#keyboard-shortcuts) (`j`/`k`, `e`, `#`, `r`, `u`, `/`). Turn off if you use voice control.

---

## Security

### Password

Local accounts only (a Google or SSO account has no Nid password): **Current password**, **New password** (at least 8 characters) and its confirmation, then **Change password**. Your other open sessions are signed out.

Forgot your password: on the sign-in screen, **Forgot your password?** sends a link valid for 1 hour (when the instance has an SMTP server, see [Configuration](../installation/configuration.md#e-mail-smtp)). Otherwise, ask an administrator to reset it ([Administration](admin.md#users)).

### Passkeys

A passkey replaces both password and 2FA code: you sign in with your device's PIN or biometrics (Face ID, Windows Hello, fingerprint, security key). Give it a **Name** (e.g. "iPhone"), then **Add a passkey** and follow the browser's dialog. Then, on the sign-in screen: **Sign in with a passkey**, without typing an e-mail. The list shows when each passkey was last used; the bin icon removes it.

The card only shows when the browser supports passkeys. A passkey is bound to the instance's address: if that address changes, register new ones.

### Two-factor authentication (2FA)

1. Click **Set up 2FA**
2. Scan the QR code with your authenticator app (Google Authenticator, Aegis, Authy…), or enter the key shown
3. Enter the **6-digit code** then **Verify and turn on**

Once on, a code is asked at each sign-in, including with Google or another provider (SSO). To turn it off, enter a code then **Turn off 2FA**.

### API tokens

For Home Assistant or a script. Give the token a **Name**, choose its **Permissions** (*Read only*, or *Read and actions* to start jobs or rules) and an **Expiration**, then **Create token**. Copy it right away: it is shown only once. Send it in the `Authorization: Bearer nid_…` header. A token never reaches account security, administration, encryption, webhooks or share links. The list shows when each token was last used; the bin icon revokes it. See the [API reference](../technical/api/auth.md#api-tokens).

### Share links

Number of active share links to your archived mails, with the **Manage share links in Archives** link ([Shares](archives.md#shares-tab) tab).

---

## Gmail accounts

Each connected account shows:

- its state: **Synced**, **Action required** (Google withdrew Nid's access: reconnect the account to resume sync and backups) or **Disconnected**;
- **Sync**: "Last synced …", number of mails in Gmail, **Sync now** button;
- **NAS backup**: **Automatic backup** (saves the account's new mails to the NAS) and its **Frequency**: Every hour, Every 6 hours, Once a day;
- **Reconnect with Google** and **Disconnect**.

**Disconnect** asks for confirmation: Nid stops syncing and backing up this account, but its archives stay on the NAS and in Nid. Pages that need Gmail (Overview, Mail, Cleanup, Rules) then show "… is disconnected" with **Reconnect in Settings**; [Archives](archives.md) stays available.

**Add a Gmail account** connects a new account, within the limit shown ("N / max accounts"). Requested access: `gmail.modify`, `gmail.labels`.

Back from Google, a **Set up the account** wizard opens for that new account (not on a reconnection):

1. **Google sign-in** — already done;
2. **Backup** — automatic backup and frequency, then the **first backup**: the last 12 months (default), the whole mailbox, or later;
3. **Rules** — starter rules to tick (clean up promotions and old newsletters, archive invoices…), each with its action, frequency and the approximate number of mails it matches today;
4. **Summary** — **Finish** applies everything. "Delete" moves mails to the Gmail trash (30 days).

Every step can be skipped; **Later** closes the wizard without saving anything. Created rules are then edited in [Rules & labels](rules.md).

---

## Notifications & webhooks

Per-event preferences (in-app, toast) and webhooks to Discord, Slack, ntfy or your own URL: see [Notifications](notifications.md).

---

## Data

Imports and export apply to the active Gmail account.

### Import an mbox file

A Google Takeout or other mail client export, added to the account's archives (Gmail labels kept). Click **Choose an .mbox file**; follow the import in [Activity](activity.md).

::: tip Google Takeout
1. Go to [takeout.google.com](https://takeout.google.com)
2. Select only **Gmail**, in **mbox** format
3. Download the archive and import the `.mbox` file into Nid
:::

### Import from an IMAP server

Copies the mails of another mailbox (Outlook, Fastmail…) into the account's archives. Fields: **Server**, **Port**, **Username**, **Password**, **Folder**, **Maximum number of mails**, **Encrypted connection (TLS)**, then **Start import**. The password is not kept.

::: warning App password
Many providers (Google, Outlook, Yahoo) require an **app password** rather than your usual password.
:::

### Export archives

**Export (.mbox)**: all of the account's archives in an .mbox file, readable by Thunderbird or Apple Mail.

### Configuration

Your rules and webhooks in a JSON file, to back them up or move them to another instance: **Export configuration** / **Import a configuration**.

### My data (GDPR)

**Export my data**: everything Nid stores about you in a JSON file (profile, Gmail accounts, rules, archive metadata, activity log…). Mail content is exported as .mbox (above); secrets (passwords, tokens) are left out.

### Delete my account

Type your password (or, for a Google/SSO account, your e-mail address), then **Permanently delete my account** and confirm. Your account, connected Gmail accounts, archives and rules are deleted from Nid; nothing is deleted in Gmail. The instance's last administrator cannot delete their account.

---

## About

- **Version**: the installed Nid version, and whether a newer one is published (checked twice a day, with the time of the last check). When an update exists, the card links to what's new and gives the command to run.
- **What Nid talks to**: the external services the instance talks to (Google, ghcr.io for the version check, your SMTP, your webhooks, the configured SSO providers). No telemetry.
- **Project**: MIT licence, source code, release history, reporting a problem.
