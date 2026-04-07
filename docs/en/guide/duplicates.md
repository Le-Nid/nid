# Duplicates

Nid automatically detects duplicate emails in your archives and lets you delete them to save space.

---

## How It Works

Duplicate detection compares three criteria:

- **Subject** of the email
- **Sender**
- **Date** (truncated to the minute)

Two emails are considered duplicates if they share exactly these three criteria. This typically happens when you archive the same emails multiple times.

---

## Detect Duplicates

1. Open the **Duplicates** page in the sidebar
2. Duplicates are automatically detected in your archives
3. Each duplicate group shows the number of copies and the reclaimable space

> 📸 *Suggested screenshot: Duplicates page with detected duplicate groups (subject, sender, number of copies)*

---

## Delete Duplicates

For each duplicate group:

1. Nid keeps the most recent email
2. Click **Delete N duplicates** to remove the extra copies
3. EML files and database entries are deleted

> 📸 *Suggested screenshot: delete button on a duplicate group*

::: info Permanent deletion
Duplicate deletion is permanent — EML files are removed from the NAS and database records are erased. Make sure they are indeed duplicates before deleting.
:::

---

## Gmail (Live) Duplicates

In addition to archives, Nid can also detect duplicates among emails still in your Gmail mailbox.
