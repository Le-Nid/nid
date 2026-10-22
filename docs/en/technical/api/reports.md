# API — Reports & Insights

Weekly reports on Nid activity.

---

## Weekly report

### GET /api/reports/weekly 🔒

Generates on demand the report of the last 7 days for the authenticated user (all Gmail accounts combined).

**Response 200**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "period": {
    "from": "2026-03-23T00:00:00Z",
    "to": "2026-03-30T00:00:00Z"
  },
  "stats": {
    "jobsCompleted": 12,
    "jobsFailed": 1,
    "mailsArchived": 38,
    "archiveSizeBytes": 52428800,
    "rulesExecuted": 3,
    "topSenders": [
      { "sender": "newsletter@service.com", "count": 23 }
    ]
  }
}
```

**Errors**

| Code | Description |
|---|---|
| 404 | User not found or disabled (`No data`) |

::: info Automatic generation
The report is also generated automatically every Monday and sent as a `weekly_report` notification (in-app depending on preferences).
:::
