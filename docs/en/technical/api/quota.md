# API — Gmail API quota

Tracks Gmail API quota consumption (`gmail_api_usage` table, one row per call). The instance-wide view is in [`GET /api/admin/quota`](admin.md#instance-gmail-api-quota).

---

## Account usage

### GET /api/quota/:accountId

**Auth**: JWT + ownership of the Gmail account.

**Response 200**
```json
{
  "limits": {
    "perSecond": 250,
    "perMinute": 15000
  },
  "usage": {
    "lastMinute": {
      "units": 120,
      "calls": 24,
      "percentOfLimit": 1
    },
    "lastHour": {
      "units": 3450,
      "calls": 690
    },
    "last24h": {
      "units": 28700,
      "calls": 5740
    }
  },
  "topEndpoints": [
    { "endpoint": "messages.get", "units": 15000, "calls": 3000 },
    { "endpoint": "messages.list", "units": 8500, "calls": 1700 }
  ],
  "hourlyBreakdown": [
    { "hour": "2026-03-20T08:00:00Z", "units": 1200, "calls": 240 },
    { "hour": "2026-03-20T09:00:00Z", "units": 890, "calls": 178 }
  ]
}
```

`topEndpoints` and `hourlyBreakdown` cover the last 24 h.

---

## Purge history

### POST /api/quota/cleanup

Deletes quota tracking data older than 30 days. **Admin only.**

**Response 200**
```json
{ "deleted": 15420 }
```
