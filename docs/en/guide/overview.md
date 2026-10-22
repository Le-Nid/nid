# Overview

The **Overview** (`/overview`, "Home" on mobile) shows the status of the active Gmail account and the next useful action. It is Nid's landing page.

---

## Header

"Hello {name}", followed by the account address and the backup status ("Last backup … ago" or "No backup yet").

---

## Indicators

Four clickable cards (2×2 on mobile):

| Card | Content | Leads to |
|---|---|---|
| **Mails in Gmail** | number of mails in the account, "N unread" | [Mail](mails.md) |
| **Recoverable** | total size of the scanned senders, "N senders to clean up" (or "Sender scan not run yet") | [Cleanup](cleanup.md) |
| **NAS backup** | share of Gmail mails already archived (%), number of archived mails | [Archives](archives.md) |
| **Active rules** | number of active rules, "N mails processed in the last 30 days" | [Rules & labels](rules.md) |

---

## Top senders

The senders who send you the most mails, with "N mails · size". **See all** opens [Cleanup](cleanup.md).

---

## Suggestions

Nid spots senders worth handling, for example:

- "{sender}: N mails never read (size)."
- "{sender} takes {size} with N mails."
- "{sender} sent you N mails you rarely read."

Each suggestion offers:

- **Unsubscribe and clean up** — same action as in [Cleanup](cleanup.md#unsubscribe-and-clean-up) (disabled if the sender offers no automatic unsubscribe); progress shows on the suggestion, which goes away once the action is done;
- **Always do this** — opens the [rule](rules.md#create-a-rule) form prefilled with the sender;
- **Ignore** — hides the suggestion.

---

## Running jobs

Tasks currently running, with their progress. **See all** opens [Activity](activity.md).
