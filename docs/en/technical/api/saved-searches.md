# API — Saved Searches

Save complex Gmail queries as reusable "views".

All routes require `Authorization: Bearer <token>`.

---

## List searches

### GET /api/saved-searches

Returns all saved searches for the authenticated user, sorted by `sort_order`.

**Response 200**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Factures récentes",
    "query": "from:factures@example.com has:attachment newer_than:30d",
    "icon": "invoice",
    "color": "#1677ff",
    "sort_order": 0,
    "created_at": "2026-03-15T10:00:00Z",
    "updated_at": "2026-03-15T10:00:00Z"
  }
]
```

---

## Create a search

### POST /api/saved-searches

**Body**
```json
{
  "name": "Factures récentes",
  "query": "from:factures@example.com has:attachment newer_than:30d",
  "icon": "invoice",
  "color": "#1677ff"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Display name (max 255 chars) |
| `query` | string | ✅ | Native Gmail query (max 2000 chars) |
| `icon` | string | — | Icon identifier (`folder`, `star`, `mail`, `attachment`, `invoice`, `alert`, `archive`, `calendar`, `work`, `shopping`) |
| `color` | string | — | Hex color code (e.g.: `#1677ff`) |

**Response 201** — The created search.

---

## Update a search

### PUT /api/saved-searches/:searchId

**Body** — All fields are optional.

```json
{
  "name": "Factures Q1 2026",
  "query": "from:factures@example.com after:2026/01/01 before:2026/04/01",
  "icon": "calendar",
  "color": "#52c41a",
  "sort_order": 2
}
```

**Response 200** — The updated search.

::: warning Ownership
Only the search owner can edit it. Returns `404` if the ID does not belong to the authenticated user.
:::

---

## Delete a search

### DELETE /api/saved-searches/:searchId

**Response 200**
```json
{ "ok": true }
```

---

## Reorder searches

### PUT /api/saved-searches/reorder

Reorganizes the display order of all searches.

**Body**
```json
{
  "ids": ["uuid-3", "uuid-1", "uuid-2"]
}
```

| Field | Type | Description |
|---|---|---|
| `ids` | string[] | Ordered list of saved search IDs |

**Response 200**
```json
{ "ok": true }
```

---

## Frontend usage

### Saved Searches page (`/saved-searches`)

- **List** of searches with name, query, icon, color and creation date
- **Create / edit** via modal (name, Gmail query, icon, color)
- **Use**: redirects to `/mails?q=<query>` to execute the search in MailManager
- **Delete** with confirmation

### "Save this search" button in MailManager

When a search or quick filter is active, a ⭐ button allows saving the current query in one click.

### Navigation

Accessible from the sidebar menu: **Email → Searches** (`/saved-searches`).

---

## Database schema

```sql
CREATE TABLE saved_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  query       TEXT NOT NULL,
  icon        VARCHAR(64),
  color       VARCHAR(32),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user_id ON saved_searches (user_id);
```
