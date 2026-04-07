# Mail management

The **My emails** page is the heart of Nid. It lets you view, filter and take bulk actions on emails in your Gmail mailbox.

---

## Viewing emails

The page displays the list of your Gmail emails with essential information: sender, subject, date, size, labels and attachment indicator.

> 📸 *Suggested screenshot: My emails page with the email list, filters and action bar*

### Search

Use the search bar at the top of the page. It supports **native Gmail syntax**:

| Example | Description |
|---|---|
| `from:amazon.fr` | Emails from Amazon |
| `subject:facture` | Emails containing "facture" in the subject |
| `has:attachment larger:5M` | Emails with attachments over 5 MB |
| `older_than:1y` | Emails older than one year |
| `is:unread from:newsletter` | Unread newsletters |
| `label:promotions` | Emails in the Promotions label |

> 📸 *Suggested screenshot: Gmail search bar with suggestions*

### Reading an email

Click on an email to open it in the **built-in reader**. The reader displays:

- The email body (HTML or plain text)
- Attachments with download option
- Metadata (sender, recipients, date, size)

> 📸 *Suggested screenshot: email reader open with an HTML email and attachments*

---

## Bulk actions

Select one or more emails (checkboxes) to bring up the **bulk action bar**:

| Action | Description |
|---|---|
| **Delete (trash)** | Sends emails to the Gmail trash (recoverable for 30 days) |
| **Delete permanently** | Irreversible email deletion |
| **Archive (Gmail)** | Removes emails from the inbox (INBOX label) |
| **Mark as read** | Marks all selected emails as read |
| **Mark as unread** | Marks all selected emails as unread |
| **Add a label** | Applies a Gmail label to selected emails |
| **Archive to NAS** | Saves emails as EML files on your NAS |

> 📸 *Suggested screenshot: bulk action bar with selected emails*

### Select all

Check the box in the table header to select all emails on the current page.

### Archive all results

The **Archive all** button launches a differential archiving of **all** emails matching the current search, without manual selection. This is an asynchronous job with real-time tracking.

---

## Asynchronous operations

Bulk operations are executed in the background via **jobs**. When you launch an operation:

1. A job is created immediately
2. A **progress modal** appears with a real-time progress bar
3. You can close the modal — the job continues in the background
4. Check the **Jobs** page to track all your running jobs

> 📸 *Suggested screenshot: JobProgressModal with progress bar at 60%*

::: tip Cancellation
You can cancel a running job from the **Jobs** page. Already processed emails are not rolled back.
:::

---

## Keyboard shortcuts

The My emails page supports keyboard shortcuts for quick navigation:

| Key | Action |
|---|---|
| <kbd>j</kbd> | Next email |
| <kbd>k</kbd> | Previous email |
| <kbd>enter</kbd> / <kbd>o</kbd> | Open selected email |
| <kbd>e</kbd> | Archive (Gmail) |
| <kbd>"#"</kbd> | Delete (trash) |
| <kbd>r</kbd> | Mark as read |
| <kbd>u</kbd> | Mark as unread |
| <kbd>"/"</kbd> | Focus on the search bar |
| <kbd>escape</kbd> | Deselect |

Shortcuts are automatically disabled when you are typing in an input field.

> 📸 *Suggested screenshot: keyboard shortcuts banner at the bottom of the My emails page*
