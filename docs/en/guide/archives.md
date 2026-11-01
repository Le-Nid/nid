# Archives

The **Archives** page (`/archives`) gives access to the local copy of your mails, saved on the NAS in EML format. It stays available even when the mails were deleted from Gmail, and even when the Gmail account was disconnected.

Five tabs: **Mails**, **Contacts**, **Trash**, **Retention**, **Shares**.

---

## Header and backup

- Status: "Last backup … ago · N mails" (or "No backup yet").
- **Back up to the NAS now**: saves the account's mails not archived yet; progress shows under the header and in [Activity](activity.md).
- **Export (.mbox)**: downloads the account's archives as mbox (readable by Thunderbird or Apple Mail). When a search or filter is active, only the loaded results are exported.

Other ways to fill the archives: **Save to the NAS** in [Mail](mails.md), an account's **Automatic backup** in [Settings › Gmail accounts](settings.md#gmail-accounts), rules "Save to the NAS then delete", and the mbox / .eml / IMAP import in [Settings › Data](settings.md#data).

---

## Mails tab: search

- **Label tree** (on the left on desktop): **All mails** then the labels that hold archived mails, with their count. For an IMAP account, these are its folders (**Folders**).
- **Full-text search**: subject, sender, content and body, plus the text of PDF and Word (.docx) attachments, accent-insensitive, with `"exact phrase"`, `-excluded` and `OR`. Matching terms are highlighted in the extract; a mail found through an attachment shows "Found in attachment “…”" with that attachment's excerpt. Existing archives are indexed in the background after the update (shown in [Activity](activity.md)).
- **Tags** (below the labels on desktop): **All tags** then your tags, with their count. A selected tag filters the list and offers **Delete tag "…"**, which removes it from every archive of the account without deleting the mails.
- **Filters**: **Sender**, period (**From** / **To**), **Min size (MB)** / **Max size (MB)**, **Attachment type** (an extension such as `pdf` or `docx`, or a MIME type such as `image/` for every image), **With attachment**. On mobile they sit in the **Filters (N)** panel with the **Label** (the **Folder** for an IMAP account) and the **Tag**, then **Show results**.

Results ("N results") show **Subject**, **Extract**, **Date**, **Sender**, **Size**. **Clear search and filters** goes back to the full list.

### Actions

- A row's `⋯` menu: **Open**, **Share**, **Restore to mailbox**, **Delete**.
- Selecting several rows: **Export .mbox**, **Tags**, **Restore to mailbox**, **Delete**.

**Tags** adds or removes the typed tags (comma-separated, your existing tags are suggested) on the whole selection. Tags stay in Nid: Gmail never sees them, and they are kept when the mail is archived again.

**Delete** moves the archives to the archive trash, with a toast "Deleting N archives in 10 s" and **Undo**.

### Archive reader

**Open** shows the archived mail: headers, body (remote images blocked, as in [Mail](mails.md#read-a-mail)), downloadable attachments, its **Tags** (remove one with a click, add some with the **Add a tag…** field then Enter) and **Conversation**. Actions: **Share**, **Restore to mailbox**, **Delete**.

### Restore to mailbox

Puts archived mails back into the account's mailbox (Gmail or IMAP server), from their EML. The restore runs in the background (shown in [Activity](activity.md)) and a notification gives the result.

**Gmail account**: same headers, same date, same labels.

- A mail **still in Gmail** is skipped; a mail **in Gmail's trash** is taken out of it.
- System labels (Inbox, Unread, Important, categories…) are put back as they were. A label deleted since is recreated with the same name. Trash, Spam and Drafts are not put back.
- After the restore, the archive points to the new Gmail mail: the next backup does not archive it a second time.
- An **encrypted** archive cannot be restored (the passphrase is not kept): it counts as an error.
- Not available for an account that must be reconnected.

**IMAP account**: the mail is uploaded, marked read and at its date, to the folder it was archived from if it still exists on the server, else to the inbox. A mail already in that folder (same Message-ID) is skipped. If the server refuses the password, the restore fails with that message and the account moves to **Action required**.

An encrypted archived mail shows "This mail is encrypted: its content cannot be read here." Archive encryption was removed from Nid: put these archives back in clear in [Settings › Data](settings.md#encrypted-archives).

---

## Share a mail

**Share** opens "Share this mail": a temporary link, readable without a Nid account.

1. Pick how long it is **Valid for**: 1 hour, 24 hours, 3 days, 7 days or 30 days.
2. **Create link**, then copy it.

The window also lists the active links of that mail ("Expires on …") with copy and revoke buttons.

Whoever opens the link sees the mail ("Email shared via temporary link"), remote images blocked. An expired or revoked link, or one that reached its access limit, shows "Link not found".

### Shares tab

All your active links: **Subject**, **Sender**, **Expires on**, **Accesses** (opens / limit), copy, revoke. The number of active links is also shown in [Settings › Security](settings.md#security).

---

## Contacts tab

The archive's address book, taken from the **From** and **To** headers of archived mails (trash excluded). Your own address is left out.

- Each contact shows its **name** (one of the names seen in its mails), its **address**, how many archived mails have it **As sender** and **As recipient** (To field, possibly with other recipients) and the **Last exchange** date.
- The contacts you exchange with most come first; **Search contacts** filters by name or address.
- Clicking a contact opens the **Mails** tab filtered on that sender.

Only the **To** field is read: Cc recipients do not appear.

---

## Trash tab

Deleted archives stay here before being erased from the NAS.

- "N mails in the trash", with the **Deleted on** date.
- **Restore** one mail, or select several then **Restore**.
- **Empty the trash**: after confirmation, permanently deletes the mails and their attachments from the NAS. Cannot be undone.
- Automatic purge: "Mails in the trash are permanently deleted after N days" (or "Automatic trash purge is off."). Administrators set **Automatic purge** and **Days before purge** here for the whole instance (see also [Admin › System](admin.md#system)).

---

## Retention tab

"Deletes archives older than a given age, for one label or all."

- **New policy**: **Name**, **Label** (or **All labels**), **Delete after (days)**.
- The list shows **Name**, **Label**, **Age** ("Older than N days") and **Last run** (with the number of archives deleted).
- **Run now** applies every policy.
- A policy's menu: edit, delete (after confirmation; archives already deleted do not come back).

With no policy, archives are kept with no time limit.
