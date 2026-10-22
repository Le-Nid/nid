# Mail

The **Mail** page (`/mails`) lists the Gmail mails of the active account. This is where you search, select and act in bulk, with an undo window for reversible actions.

---

## Header

- **Mail** title and estimated number of results ("~N results", an estimate from Gmail).
- **Refresh**: reloads the list.
- **Save all to the NAS**: saves every result of the current search to the [Archives](archives.md) (only mails not archived yet are copied).
- **Create a rule** (when a search is entered): opens the [rule](rules.md#create-a-rule) form; if the search is a single `from:address`, the sender is prefilled.

---

## Account: one account or "All accounts"

When at least two Gmail accounts are connected, a **Gmail Account** selector appears above the list. It offers each account and **All accounts** (address `/mails?account=all`, which replaces the former unified inbox).

In **All accounts** mode:

- an **Account** column shows which account each mail belongs to;
- actions on a selection are sent account by account;
- **Create a rule** is only offered when the selection comes from a single account;
- **Add a label**, **Save all to the NAS**, selecting all results and the **Show more** button are not available.

---

## Search

The search bar accepts Gmail syntax: keywords and operators (`from:`, `has:attachment`, `larger:10M`, `older_than:1y`…). When you press `Enter`, each operator becomes a **token** you remove with one click; the rest stays as free text.

### Quick searches and saved searches

Above the bar, chips apply a search in one click:

| Chip | Gmail query |
|---|---|
| All | *(empty)* |
| Unread | `is:unread` |
| With attachments | `has:attachment` |
| Large > 10 MB | `larger:10m` |
| Promotions > 6 months | `category:promotions older_than:6m` |
| Social | `category:social` |
| Older than a year | `older_than:1y` |
| Spam | `in:spam` |
| Trash | `in:trash` |

Your **saved searches** follow. To create one, run a search then click **Save search** (the button shows when the search matches no chip); the chip is named after the query text.

The search and the account are part of the page address (`?q=…&account=…`): a bookmark or the back button keeps them.

---

## The list

Columns: **From**, **Subject** (with snippet, paperclip if there is an attachment), **Labels**, **Size**, **Date**. The **Columns** button hides or shows columns. Unread mails are in bold.

The list loads by pages: **Show more** loads the next one, until "All mail loaded".

Each row's `⋯` menu offers **Open**, **Archive (remove from inbox)**, **Save to the NAS** and **Delete**.

On mobile, each mail is a card (sender, date, subject) with a checkbox.

---

## Select

- Tick rows, or the header checkbox for the whole loaded page.
- **All results**: when a search is entered and every loaded row is ticked, a banner reads "All N emails on this page are selected" with the link **Select all ~N search results**. The action then applies to the whole query on the server, including mails not loaded; the counter shows "~N selected".
- **Clear selection** (✕) or `Esc` empties the selection. Changing the search or the account empties it too.

### Action bar

As soon as a mail is selected, the action bar appears:

| Action | Effect |
|---|---|
| **Archive (remove from inbox)** | removes the mails from the Gmail inbox |
| **Save to the NAS** | copies the mails to the [Archives](archives.md) |
| **Mark as read** / **Mark as unread** | changes the read state |
| **Delete** | moves the mails to the Gmail trash |
| **Add a label** | applies an existing Gmail label (picked from a list) |
| **Create a rule** | opens the rule form, prefilled when the selection comes from a single sender |

On mobile, the bar sits at the bottom of the screen: four actions visible, the others under **More**.

---

## Undo

**Delete** and **Archive (remove from inbox)** do not run right away: a toast shows for example "Deleting 12 emails in 10 s" ("To the Gmail trash · tracked in Activity") with an **Undo** button. The mails leave the list immediately; **Undo** within 10 seconds brings them back and nothing is done. After the delay the action runs ("Too late to undo: the action is already running." if you click too late).

During the delay, the task shows as "Waiting" in [Activity](activity.md), where it can also be cancelled.

The other actions (read state, label, NAS backup) start immediately; their progress shows at the top of the list.

---

## Read a mail

Click a mail (or **Open**): the reader opens as a panel on the right (full screen on mobile).

- Header: subject, **From**, **To**, date, labels.
- The mail body is shown in an isolated frame, without scripts. **Remote images are blocked** ("Remote images blocked to protect your privacy."); **Show** loads them for that mail. To allow them everywhere, see [Settings › Account](settings.md#account).
- Downloadable attachments, and the **Conversation** (the other messages of the thread).
- Actions: **Archive (remove from inbox)**, **Save to the NAS**, **Delete**, **Create a rule** (prefilled with the sender).

---

## Keyboard shortcuts

On desktop, under the list:

| Key | Action |
|---|---|
| `j` / `k` | next / previous mail |
| `o` | open the mail |
| `e` | archive (remove from inbox) |
| `#` | delete |
| `r` | mark as read |
| `u` | mark as unread |
| `/` | go to the search |
| `Esc` | clear the selection |

`e`, `#`, `r` and `u` act on the selection, otherwise on the focused mail. Shortcuts are inactive while typing and while the reader or a form is open.

These are single-key shortcuts: the **Turn off** link under the list (or the **Single-key keyboard shortcuts** switch in [Settings › Account](settings.md#account)) disables them, for instance if you use voice control. The choice is remembered by the browser.
