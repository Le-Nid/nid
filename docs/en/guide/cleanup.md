# Cleanup

The **Cleanup** page (`/cleanup`) frees space in a few clicks. Its header sums up the possible gain: "6.1 GB to reclaim. The top 8 senders weigh 4.6 GB."

Two tabs: **Senders & newsletters** and **Large mails & attachments**.

---

## Senders & newsletters

### Scan the mailbox

On the first visit: "This account has not been scanned yet". Click **Scan the mailbox**: Nid groups mailing-list and newsletter mails by sender. The scan runs in the background; you can leave the page.

Afterwards, the date of the last scan shows ("Scanned on …") with **Scan again**.

### Sender list

For each sender: **Sender**, **Address**, **Size**, **Mails**, **Never opened**, and its actions.

- **Sort by**: **Number of mails**, **Size** or **Never opened**.
- **Newsletters only (List-Unsubscribe)**: keeps only senders that offer an automatic unsubscribe.

Sorting and filter are kept in the page address.

### Actions on a sender

| Action | Effect |
|---|---|
| **Unsubscribe and clean up** | unsubscribes, then moves all its mails to the Gmail trash |
| **Delete all** | moves all its mails to the Gmail trash, without unsubscribing |
| **Always do this** | opens the [rule](rules.md#create-a-rule) form prefilled with the sender, to also handle its future mails |

On mobile, a card's `⋯` button opens these actions in a panel.

#### Unsubscribe and clean up

A confirmation shows: "Unsubscribe from {sender}?". The sender's unsubscribe page opens in a new tab: **unsubscribing is final**. Its mails then go to the Gmail trash.

If the sender provides no `List-Unsubscribe` header, the button is disabled with the note "This sender offers no automatic unsubscribe"; **Delete all** and **Always do this** stay available.

#### Undo and progress

Deleting the mails (after unsubscribing or with **Delete all**) shows the toast "Deleting N emails in 10 s" with **Undo**, as in [Mail](mails.md#undo). Progress then shows on the sender's row, with **Stop**. The task is also listed in [Activity](activity.md).

---

## Large mails & attachments

The account's heaviest attachments, sorted by size. The summary reads "N attachments · size".

**Source**:

- **Gmail**: Gmail mails with an attachment over 100 KB. Tick rows to **Save to the NAS** or **Delete** the matching mails (deletion can be undone for 10 s).
- **Archives (NAS)**: attachments already archived. Those mails are no longer handled here; download only.

Columns: **File**, **Mail** (subject), **Size**, **Date**, and a download button.

For every attachment, with search and paging, see the [Attachments](attachments.md) page.
