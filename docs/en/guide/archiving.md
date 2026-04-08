# Archiving

Nid allows you to save your emails to your NAS in **EML** format (one file per email). Archives are indexed in PostgreSQL for fast searching.

---

## Why archive?

- **Free up your Gmail quota**: delete emails from Gmail after archiving them locally
- **Long-term backup**: EML files are in a standard format, readable by any email client (Thunderbird, Outlook, etc.)
- **Fast search**: archives are full-text indexed in PostgreSQL
- **Your data stays with you**: no data leaves your network

---

## Archiving emails

### Archiving by selection

1. In **My emails**, select the emails to archive
2. Click **Archive to NAS** in the action bar
3. An archiving job is created with real-time tracking

### Archiving by query (archive all)

1. In **My emails**, enter a search query (e.g. `from:amazon.fr older_than:6m`)
2. Click **Archive all**
3. All matching emails are archived differentially

### Differential archiving

Archiving is **differential** by default: only emails that have not yet been archived are processed. If you archive the same query twice, the second run only processes new emails.

> 📸 *Suggested screenshot: "Archive all" button on the My emails page*

---

## Browsing archives

The **Archives** page in the sidebar displays all your archived emails.

### Full-text search

The search bar enables **full-text search** across your archives. The search covers:

- **Email subject** (highest priority)
- **Sender** (medium priority)
- **Content** of the email (excerpt/snippet, lowest priority)

> 📸 *Suggested screenshot: Archives page with the full-text search bar and results*

### Sorting and filters

You can sort archives by:

- Date (newest / oldest)
- Size (largest / smallest)
- Sender

### Reading an archived email

Click on an archived email to open it in the built-in reader. The content is read directly from the EML file on disk.

If the email is **encrypted**, it will be decrypted on the fly (you must have configured your passphrase — see [Privacy](privacy.md#chiffrement-des-archives)).

### Conversation (thread) view

Archives support the **conversation** view: emails sharing the same thread are grouped together. Switch between list view and conversation view with the toggle at the top of the page.

> 📸 *Suggested screenshot: list/conversation toggle on the Archives page*

---

## Archived attachments

Attachments are extracted and stored separately during archiving. You can download them individually from:

- The archived email reader
- The **Attachments** page (Archives tab)

---

## ZIP export

Export a selection of archived emails in ZIP format:

1. In **Archives**, select the emails to export
2. Click **Export as ZIP**
3. A ZIP file containing the EML files is downloaded

---

## Disk organization

Archives are organized on the NAS according to the following structure:

```
/archives/
└── {account_id}/
    └── {year}/
        └── {month}/
            ├── {message_id}.eml
            └── attachments/
                ├── invoice.pdf
                └── photo.jpg
```

Each email is identified by a unique UUID (the `gmail_message_id`).

---

## Archive trash

Archived emails can be deleted via the **trash**. Deletion is a **soft-delete**: emails are not immediately erased from disk.

### Deleting archives

1. In **Archives**, select the emails to delete
2. Click **Delete** in the action bar
3. Confirm the deletion — emails are moved to trash

> 📸 *Suggested screenshot: Delete button and confirmation in the archive action bar*

### Browsing the trash

Switch to the **Trash** tab (next to List and Conversations) to see deleted emails:

- Each email shows its **deletion date** and the **time remaining** before permanent purge
- A color indicator highlights emails close to expiration (red ≤ 3 days, orange ≤ 7 days)

> 📸 *Suggested screenshot: Trash tab with expiration indicators*

### Restoring emails

1. In the **Trash** tab, select the emails to restore
2. Click **Restore** in the action bar
3. Emails are returned to the archives

You can also restore an individual email by clicking the restore icon in its row.

### Emptying the trash

The **Empty trash** button **permanently** deletes all emails in the trash:

- EML files are deleted from disk
- Associated attachments are deleted
- Database records are removed
- **This action is irreversible**

### Automatic purge

A scheduled job automatically purges emails that have been in the trash for more than **30 days** (by default). This job runs daily at 4 AM.

You can configure the purge from the **Jobs** page:

- **Enable/disable** automatic purge
- **Change the retention period** (1 to 365 days)

> 📸 *Suggested screenshot: trash configuration section on the Jobs page*

::: tip Advice
If you accidentally delete important emails, you can restore them as long as they haven't been purged. Check the trash regularly to avoid surprises.
:::
