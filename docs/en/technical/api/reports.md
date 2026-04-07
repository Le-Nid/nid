# API — Reports & Insights

Weekly report generation on Gmail activity.

---

## Weekly report

### GET /api/reports/weekly 🔒

Generates the report for the past week for the authenticated user.

**Response 200**
```json
{
  "period": {
    "from": "2026-03-23T00:00:00Z",
    "to": "2026-03-30T00:00:00Z"
  },
  "accounts": [
    {
      "accountId": "uuid",
      "email": "user@gmail.com",
      "mailsReceived": 142,
      "mailsArchived": 38,
      "mailsDeleted": 15,
      "topSenders": [
        { "sender": "newsletter@service.com", "count": 23 }
      ],
      "rulesExecuted": 3,
      "storageFreed": 52428800
    }
  ]
}
```

**Errors**

| Code | Description |
|---|---|
| 404 | No data available for the period |

::: info Automatic generation
The report is also automatically generated every Monday by the scheduler and stored as an in-app notification.
:::
