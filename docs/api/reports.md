# API — Rapports & Insights

Génération de rapports hebdomadaires sur l'activité Gmail.

---

## Rapport hebdomadaire

### GET /api/reports/weekly 🔒

Génère le rapport de la semaine écoulée pour l'utilisateur authentifié.

**Réponse 200**
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

**Erreurs**

| Code | Description |
|---|---|
| 404 | Aucune donnée disponible pour la période |

!!! info "Génération automatique"
    Le rapport est aussi généré automatiquement chaque lundi par le scheduler et stocké comme notification in-app.
