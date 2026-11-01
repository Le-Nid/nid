# Attachments

The **Attachments** page (`/attachments`) lists every attachment of the active account, heaviest first. It has no sidebar entry: open it from the command palette (`⌘K` / `Ctrl+K`, **Other pages** group).

For a quick sort of large mails with bulk actions, the **Large mails & attachments** tab of [Cleanup](cleanup.md#large-mails-attachments) is usually enough.

---

## Source

Two buttons pick the source:

- **Archives** (default): attachments of the mails saved on the NAS. A search **by name, subject, sender or content** is available: the text of PDFs and Word documents (.docx) is searched too (same rules as the [Archives](archives.md) search: accent-insensitive, `"exact phrase"`, `-exclude`, `OR`), and the matching excerpt shows under the file name.
- **Live**: attachments over 100 KB still in Gmail.

Source, search and page are kept in the address. **Reload** fetches the list again.

---

## Indicators

- **Attachments**: number of files;
- **Total size**;
- **Source**: "Local archives" or "Gmail (>100 KB)";
- **Space saved**: gain from deduplicating archived attachments ("N duplicate file(s), X saved"). An identical file (same content) is written once per account, whether the mail comes from a Gmail backup, an IMAP account or an mbox / .eml import. If some files archived before this deduplication have not been analyzed yet, the **Analyze** button runs it and merges the duplicates.

---

## List

Columns: **File**, **Email**, **Size**, **Date**, **Type**, **Actions**. The list is paginated.

- **Download**: saves the file.
- **View**: opens the file in the browser, only for images (PNG, JPEG, GIF, WebP) and PDFs.
