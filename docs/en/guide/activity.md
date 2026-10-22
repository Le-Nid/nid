# Activity

The **Activity** page (`/activity`) lists "everything you and your rules started, live": bulk actions, NAS backups, rules, scans, imports, purges… It replaces the former "Job Tracking" page.

On desktop, the sidebar shows "N running" next to **Activity**; on mobile, the page is under **More › Tools**.

---

## Filters

- **Gmail account**: one account or **All accounts**. Instance-wide tasks (with no account) are marked **Instance**.
- **Status**, as chips with a counter: **All**, **Waiting**, **Running**, **Failed**, **Completed**.

Filters are kept in the page address.

---

## Task list

| Column | Content |
|---|---|
| **Status** | Pending, Scheduled, Running, Completed, Failed, Cancelled |
| **Task** | task type, account, and origin: "Rule", "Cleanup › sender", "Mails › query" or "Retry" |
| **Progress / result** | live progress bar, "Done · N emails processed", error message, "Stopped"… |
| **Duration** | run time |

"Waiting" groups the tasks queued and those waiting for their undo window to end (10 s after a deletion, for instance).

The footer reads "N of M · history kept for 30 days"; **Show more** loads the rest.

---

## Actions by status

| Status | Action |
|---|---|
| Waiting | **Cancel**: the task will not run |
| Running | **Stop**, in the progress bar |
| Failed | **Retry** and **Details** (start date and error message) |
| Completed | **View**: opens the related page (Mail, Rules, Cleanup, Archives…), otherwise **Details** |

An IMAP import task cannot be retried from here, since the password is not stored: "This task needs credentials that are not stored: start it again from its page."

---

## Elsewhere in the app

A task's progress also shows where it was started (sender row in Cleanup, Archives header, Mail list), and the [Overview](overview.md) lists running jobs. When a task ends, a [notification](notifications.md) may be sent depending on your preferences.
