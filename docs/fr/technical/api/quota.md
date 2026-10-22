# API — Quota Gmail API

Suivi de la consommation du quota Gmail API (table `gmail_api_usage`, une ligne par appel). La vue de toute l'instance est dans [`GET /api/admin/quota`](admin.md#quota-gmail-api-de-l-instance).

---

## Consommation d'un compte

### GET /api/quota/:accountId

**Auth** : JWT + propriété du compte Gmail.

**Réponse 200**
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

`topEndpoints` et `hourlyBreakdown` portent sur les dernières 24 h.

---

## Purger l'historique

### POST /api/quota/cleanup

Supprime les données de suivi de quota de plus de 30 jours. **Admin uniquement.**

**Réponse 200**
```json
{ "deleted": 15420 }
```
