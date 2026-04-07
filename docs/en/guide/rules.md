# Automatic rules

Rules allow you to automate the cleanup and organization of your Gmail mailbox. Define conditions and actions — Nid executes them for you.

---

## Overview

A rule consists of:

- **Conditions**: which emails to target (sender, subject, size, etc.)
- **Action**: what to do with those emails (delete, archive, label, etc.)
- **Schedule**: when to run the rule (manually, daily, weekly, etc.)

> 📸 *Suggested screenshot: Rules page with the list of configured rules (name, summarized conditions, action, schedule, active/inactive toggle)*

---

## Create a rule

1. In **Rules**, click **Create a rule**
2. Fill in the form fields

> 📸 *Suggested screenshot: rule creation form (modal) with conditions, action and schedule fields*

### Conditions

You can combine multiple conditions. **All conditions** must be met for an email to be targeted (AND logic).

| Field | Description | Example |
|---|---|---|
| `from` | Sender | `newsletter@example.com` |
| `to` | Recipient | `my-alias@gmail.com` |
| `subject` | Email subject | `promotion` |
| `has_attachment` | Has attachment | `true` / `false` |
| `size_gt` | Minimum size (in bytes) | `5242880` (5 MB) |
| `older_than` | Minimum age | `30d`, `6m`, `1y` |
| `label` | Gmail label | `INBOX`, `SPAM`, `Label_123` |
| `is_unread` | Unread | `true` / `false` |

Available operators: `contains`, `equals` (exact match), `not_contains`, `gt` (greater than), `lt` (less than).

### Actions

| Action | Description |
|---|---|
| **Move to trash** | Sends emails to the Gmail trash |
| **Delete permanently** | Irreversible deletion |
| **Archive (Gmail)** | Removes from the inbox |
| **Archive to NAS** | Saves as EML on your NAS |
| **Add a label** | Applies a Gmail label |
| **Remove a label** | Removes a Gmail label |
| **Mark as read** | Marks emails as read |
| **Mark as unread** | Marks emails as unread |

### Schedules

| Option | Description |
|---|---|
| **Manual** | Runs only on demand |
| **Hourly** | Runs every hour |
| **Daily** | Runs once a day |
| **Weekly** | Runs every Monday |
| **Monthly** | Runs on the 1st of each month |

---

## Rule templates

To get started quickly, Nid offers a **library of pre-configured templates**.

1. Click **Templates** at the top of the Rules page
2. Browse templates by category:
    - **Cleanup**: delete promotional emails, old notifications
    - **Archive**: archive invoices, old emails
    - **Organization**: automatically label by sender
3. Click **Use** on a template
4. The rule is created — modify it if needed then activate it

> 📸 *Suggested screenshot: rule templates drawer/panel with the 3 categories*

Template examples:

- "Clean up GitHub notifications older than 30 days"
- "Archive invoices older than 3 months"
- "Delete unread newsletters older than 30 days"

---

## Preview a rule

Before running a rule, you can **preview** it:

1. Click **Preview** on an existing rule
2. Nid displays the list of emails matching the conditions
3. Verify that the targeted emails are the ones you expect
4. Click **Run** to launch the rule

> 📸 *Suggested screenshot: rule preview result with the list of matching emails*

---

## Run a rule

### Manual execution

Click **Run** on a rule to launch it immediately. A job is created with real-time tracking.

### Scheduled execution

If a schedule is configured (daily, weekly, etc.), the rule runs automatically. The **Last run** field indicates when the rule was last executed.

---

## Enable / disable a rule

The **toggle** next to each rule lets you enable or disable it without deleting it. A disabled rule is not executed during automatic schedules.

---

## Edit and delete

- Click on a rule to open the editing form
- The **Delete** button permanently deletes the rule
