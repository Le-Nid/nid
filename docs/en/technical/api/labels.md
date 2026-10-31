# API — Labels

Gmail labels synced per account in the `gmail_labels` table (names, Gmail colors, type), so archives keep showing a label's name after it is deleted in Gmail.

All routes require authentication and ownership of the Gmail account. `:accountId` must be a UUID (`400` otherwise).

**When labels are synced**

- when a Gmail account is connected (OAuth callback, in the background);
- once a day by the scheduler (one `labels.list` call per active account);
- on demand with `POST /api/labels/:accountId/sync`;
- when a label is created, updated or deleted through `/api/gmail/:accountId/labels`.

A label missing from Gmail is never deleted from the table: its `deleted_at` is set. It is cleared if the label comes back.

---

## List labels

### GET /api/labels/:accountId

Returns every label of the account, deleted ones included, sorted by name, with the number of archived mails (not in the archive trash) carrying it.

**Response 200**
```json
[
  {
    "account_id": "uuid",
    "id": "Label_12",
    "name": "Factures",
    "color_bg": "#16a765",
    "color_text": "#ffffff",
    "type": "user",
    "messages_total": null,
    "deleted_at": null,
    "updated_at": "2026-10-21T08:00:00Z",
    "archived_count": 42
  }
]
```

| Field | Description |
|---|---|
| `id` | Gmail label id (`INBOX`, `CATEGORY_PROMOTIONS`, `Label_12`…), or `imported:<name>` for a label only known from an mbox import |
| `type` | `system`, `user`, `category` (Gmail `CATEGORY_*`), `imported` (Takeout `X-Gmail-Labels` name unknown to Gmail) |
| `color_bg` / `color_text` | Gmail colors, `null` when the label has none |
| `deleted_at` | Set when the label disappeared from Gmail |
| `archived_count` | Archived mails whose `label_ids` contain this id |

---

## Sync now

### POST /api/labels/:accountId/sync

Fetches the labels from Gmail and updates the table.

**Response 200**
```json
{ "synced": 18 }
```
