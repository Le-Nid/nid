# Rules & labels

The **Rules & labels** page (`/rules`) automates sorting your mailbox: each rule applies an action to the mails it matches. It has two tabs: **Rules** and **Labels** (`/rules?tab=labels`).

---

## Rules tab

The list shows for each rule:

- **Name**;
- **Conditions**, in plain words ("from news@example.com, older than 30 days");
- **Action** ("Apply a label “Invoices”"…);
- **Last run** (or "Never run");
- **Active**: a switch to pause or resume the rule.

A rule's `⋯` menu offers:

- **Run**: runs the rule now on mails already received. A toast "Running “…”" lets you **Undo** for 10 s; follow the rest in [Activity](activity.md).
- **Edit**: opens the form.
- **Delete**: after confirmation ("The rule will not run anymore. Mails it already handled stay as they are.").

With no rule, the page suggests creating one or starting from a template in the Labels tab.

---

## Create a rule

The **New rule** button (also in the `⌘K` palette) opens the form. It also opens prefilled from:

- [Mail](mails.md): **Create a rule** in the header (current search), the selection bar or the reader;
- [Cleanup](cleanup.md) and the [Overview](overview.md) suggestions: **Always do this**;
- the Labels tab: **Create a rule** on a label.

### Fields

| Field | Content |
|---|---|
| **Name** | suggested automatically ("Mails from …") |
| **When a mail comes from** | address or domain, e.g. `news@example.com` |
| **Other conditions (kept)** | conditions of an existing rule that the form cannot edit; they are kept as they are |
| **And is older than** | No limit, 7 days, 30 days, 6 months |
| **Then** | Save to the NAS then delete · Archive (remove from inbox) · Delete · Apply a label (+ pick the **Label**) |
| **Runs** | Manual, Daily (default), Weekly |
| **Also apply to mails already received** | runs the rule as soon as it is saved (with the same undo toast) |

A sender is required: "a rule based on age alone would target the whole mailbox".

### Preview

Under the form, Nid computes the matching mails: "143 matching mails · 58 MB", a few **Examples**, and the **See the 143 mails** link, which opens [Mail](mails.md) with the matching search.

**Create rule** (or **Save** when editing) confirms.

---

## Labels tab

"Your Gmail labels, synced with their colors, and ready-made templates."

### Gmail labels

The account's label tree, with their Gmail color and the number of archived mails. Nested labels (`Invoices/Power`) show as a tree.

- **New label**: creates the label in Gmail. Use "/" to nest it, e.g. `Invoices/Power`.
- A label's menu:
  - **Rename**;
  - **Color** (Gmail palette: Red, Orange, Yellow, Green, Teal, Blue, Purple, Pink, Gray);
  - **Create a rule** that applies this label;
  - **See mails**: opens [Mail](mails.md) filtered on this label;
  - **Delete**: after confirmation; the label is removed from Gmail and from the mails that have it, the mails are not deleted.

### Gmail categories

Promotions, Social, Updates, Forums: "Assigned by Gmail, cannot be changed."

### Templates

"One click creates the Gmail label and the rule that fills it."

- Labels: **Factures** (invoices), **Livraisons** (deliveries), **Banque** (bank), **Billets & voyages** (tickets & travel) — each template creates the label and a daily rule that applies it based on subject keywords (button **Create label and rule**). Template names come from the server and are in French.
- Expiry: **Codes OTP (expire après 1 jour)**, **Promotions (expire après 7 jours)** — a rule that deletes those mails once they are older than the age (button **Activate**). These templates replace the former "Email expiration" page.
- **Other templates**: cleanup (GitHub notifications, unread newsletters, promotions, social), archiving (old mails, invoices, large mails) and organizing (mark old mails as read…), button **Activate**.

A template already in use shows **Already active** and the **Edit rule** button.
