# Attachments

The **Attachments** page centralizes all attachments from your emails, whether they're in Gmail or in your local archives.

---

## Two Tabs

The page is divided into two tabs:

### Archives (NAS)

Attachments from emails archived on your NAS. They are stored separately from EML files and indexed in the database.

- Search by file name
- Sort by size or date
- Direct download

### Gmail (Live)

Attachments from emails still in your Gmail mailbox. A scan is performed via the Gmail API to retrieve the list.

- On-demand scan
- Sort by size to identify the largest files
- Navigate to the email in Gmail

> 📸 *Suggested screenshot: Attachments page with both Archives / Gmail tabs, the attachment list, and sort buttons*

---

## Search and Sort

You can:

- **Search** by file name (e.g., `invoice`, `.pdf`, `photo.jpg`)
- **Sort by size**: largest files first — ideal for freeing up space
- **Sort by date**: newest or oldest first
- **Paginate**: navigate between result pages

---

## Download

Click the **Download** button next to an attachment to download it directly. Archived attachments are served from the NAS, while Gmail attachments are fetched via the Gmail API.

---

## Use Cases

- **Free up Gmail space**: identify the largest attachments, archive the corresponding emails to the NAS, then delete them from Gmail
- **Find a file**: search for a file name in the archives
- **Storage audit**: visualize the distribution of attachment types

---

## Content Hash Deduplication

Nid automatically deduplicates identical attachments during archiving. Each file is identified by its SHA-256 hash: if two emails contain exactly the same attachment, the file is stored only once on disk.

### Statistics

The **Space Saved** card displays:

- The amount of disk space saved through deduplication
- The number of duplicate files detected
- Hash coverage (percentage of attachments analyzed)

### Backfill

If you archived emails before deduplication was enabled, click the **Analyze** button to calculate hashes for existing attachments. This operation:

1. Reads each file from storage (local or S3)
2. Calculates the SHA-256 hash
3. Identifies duplicates and removes redundant copies
4. Updates the database to point to the unique file

> ⚠️ Backfill may take some time if you have many archived attachments.
