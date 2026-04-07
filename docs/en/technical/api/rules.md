# API — Automatic rules

---

## List rules

### GET /api/rules/:accountId

Returns all rules for the Gmail account.

---

## Create a rule

### POST /api/rules/:accountId

**Body**
```json
{
  "name": "Newsletters → corbeille",
  "description": "Supprime automatiquement les newsletters",
  "conditions": [
    { "field": "from", "operator": "contains", "value": "newsletter" },
    { "field": "has_attachment", "operator": "is_true", "value": false }
  ],
  "action": { "type": "trash" },
  "schedule": "daily",
  "is_active": true
}
```

### Available condition fields

| Field | Description | Operators |
|---|---|---|
| `from` | Sender | `contains`, `not_contains`, `equals`, `not_equals` |
| `to` | Recipient | `contains`, `not_contains`, `equals`, `not_equals` |
| `subject` | Subject | `contains`, `not_contains`, `equals`, `not_equals` |
| `has_attachment` | Has an attachment | `is_true` |
| `size_gt` | Size greater than (bytes) | `gt` |
| `size_lt` | Size less than (bytes) | `lt` |
| `label` | Gmail label | `equals`, `not_equals` |
| `older_than` | Minimum age | `equals` (e.g.: `7d`, `3m`, `1y`) |
| `newer_than` | Maximum age | `equals` (e.g.: `7d`, `3m`, `1y`) |

### Available actions

| Type | Description |
|---|---|
| `trash` | Gmail trash |
| `delete` | Permanent deletion ⚠️ |
| `label` | Add a label (`labelId` required) |
| `unlabel` | Remove a label (`labelId` required) |
| `archive` | Remove from INBOX |
| `archive_nas` | Archive to NAS (EML) |
| `mark_read` | Mark as read |
| `mark_unread` | Mark as unread |

### Schedules

| Value | Frequency |
|---|---|
| `null` | Manual only |
| `hourly` | Every hour |
| `daily` | Every day |
| `weekly` | Every week |
| `monthly` | Every month |

---

## Update a rule

### PUT /api/rules/:accountId/:ruleId

Same fields as creation, all optional.

---

## Enable / disable

### PATCH /api/rules/:accountId/:ruleId/toggle

Toggles the `is_active` status of the rule.

**Response**: updated rule.

---

## Delete a rule

### DELETE /api/rules/:accountId/:ruleId

**Response 204**

---

## Run manually

### POST /api/rules/:accountId/:ruleId/run

Triggers rule execution via BullMQ (asynchronous).

**Response 202**
```json
{ "jobId": "run_rule-1234567890", "message": "Rule execution enqueued" }
```

---

## Preview

### POST /api/rules/:accountId/preview

Counts emails that would match the conditions **without** applying any action.

**Body**
```json
{ "conditions": [...] }
```

**Response**
```json
{
  "query": "from:(newsletter) -has:attachment",
  "estimatedCount": 342
}
```

::: tip Always preview before creating
The preview translates your conditions into a native Gmail query and gives you an estimate of the number of affected emails. Useful to avoid surprises with irreversible actions like `delete`.
:::

---

## Rule templates

### GET /api/rules/templates

Returns the library of pre-configured rules, organized by category.

**Response**
```json
[
  {
    "id": "cleanup-github-notifications",
    "name": "Nettoyer les notifications GitHub",
    "description": "Supprime les notifications GitHub lues de plus de 7 jours",
    "category": "cleanup",
    "dto": {
      "name": "...",
      "conditions": [...],
      "action": { "type": "trash" },
      "schedule": "daily"
    }
  }
]
```

Available categories: `cleanup`, `archive`, `organize`.

### POST /api/rules/:accountId/from-template

Creates a rule from a template.

**Body**
```json
{ "templateId": "cleanup-github-notifications" }
```

**Response 201**: the created rule.
