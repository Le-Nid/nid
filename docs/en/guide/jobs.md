# Job tracking

All long-running operations in Nid (bulk deletion, archiving, newsletter scanning, etc.) are executed in the background via **jobs**. The Jobs page lets you track their progress.

---

## Job list

The **Jobs** page displays all your jobs with their current status:

| Status | Meaning |
|---|---|
| 🟡 **Pending** | The job is in the queue, not yet started |
| 🔵 **Running** | The job is currently executing |
| 🟢 **Completed** | The job finished successfully |
| 🔴 **Failed** | The job failed (3 automatic retries exhausted) |
| ⚪ **Cancelled** | The job was manually cancelled |

> 📸 *Suggested screenshot: Jobs page with several jobs in different statuses*

---

## Job types

| Type | Triggered by |
|---|---|
| **Bulk operation** | Bulk actions in My emails (delete, label, etc.) |
| **Archiving** | Archiving to NAS from My emails |
| **Rule execution** | Manual or scheduled launch of a rule |
| **Newsletter scan** | Scan from the Newsletters page |
| **Tracking pixel scan** | Scan from the Privacy page |
| **PII scan** | Sensitive data scan from Privacy |
| **Archive encryption** | Encryption from Privacy |

---

## Real-time tracking

When a job is launched, a **progress modal** appears automatically:

- Progress bar (e.g.: 42/150 emails processed)
- Completion percentage
- Real-time status

> 📸 *Suggested screenshot: job progress modal with progress bar*

Updates are instant thanks to **Server-Sent Events** (SSE) — no need to refresh the page.

You can close the modal without interrupting the job. It continues in the background.

---

## Cancel a job

To cancel a pending or running job:

1. Click the **Cancel** button next to the job
2. The job moves to **Cancelled** status

::: warning Partial cancellation
Emails already processed before cancellation are not restored. For example, if 50 out of 100 emails were deleted when you cancel, the first 50 remain deleted.
:::

---

## Job details

Click on a job to see its details:

- Operation type
- Gmail account involved
- Number of emails processed / total
- Creation and completion date
- Error message (in case of failure)

---

## Automatic retry

In case of errors (e.g.: Gmail API timeout), jobs are automatically retried up to **3 times** with exponential backoff:

- 1st attempt: immediate
- 2nd attempt: after 2 seconds
- 3rd attempt: after 4 seconds
- After 3 failures: the job moves to **Failed** status

---

## Job completion notifications

When a job finishes (success or failure), you receive a notification:

- **In-app**: in the notification bell (🔔)
- **Toast**: temporary pop-up at the bottom of the page (if enabled in [preferences](notifications.md))
- **Webhook**: push to Discord, Slack, etc. (if [configured](notifications.md#webhooks))
