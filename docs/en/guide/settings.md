# Settings

**Settings** (`/settings/…`) is split into five sections, as tabs on desktop and listed in the **More** page on mobile:

| Section | Address |
|---|---|
| [Account](#account) | `/settings/account` |
| [Security](#security) | `/settings/security` |
| [Gmail accounts](#gmail-accounts) | `/settings/gmail` |
| [Notifications & webhooks](#notifications-webhooks) | `/settings/notifications` |
| [Data](#data) | `/settings/data` |

---

## Account

- **Profile**: avatar, name, email, and the space used by your archives ("Archives: X used of Y", quota set by the administrator).
- **Language and appearance**: **Language** (French / English) and **Theme** (**System**, **Light**, **Dark**). Language and dark mode are also in the avatar menu.
- **Reading**:
  - **Show remote images**: off by default, since these images are often used to know when you open a mail. A "Show" button stays available in each mail.
  - **Single-key keyboard shortcuts**: turns on the [Mail shortcuts](mails.md#keyboard-shortcuts) (`j`/`k`, `e`, `#`, `r`, `u`, `/`). Turn off if you use voice control.

---

## Security

### Two-factor authentication (2FA)

1. Click **Set up 2FA**
2. Scan the QR code with your authenticator app (Google Authenticator, Aegis, Authy…), or enter the key shown
3. Enter the **6-digit code** then **Verify and turn on**

Once on, a code is asked at each sign-in. To turn it off, enter a code then **Turn off 2FA**.

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
