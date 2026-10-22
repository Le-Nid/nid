# API — Rapports & Insights

Génération de rapports hebdomadaires sur l'activité Nid.

---

## Rapport hebdomadaire

### GET /api/reports/weekly 🔒

Génère à la demande le rapport des 7 derniers jours pour l'utilisateur authentifié (tous comptes Gmail confondus).

**Réponse 200**
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

**Erreurs**

| Code | Description |
|---|---|
| 404 | Utilisateur introuvable ou désactivé (`No data`) |

::: info Génération automatique
Le rapport est aussi généré automatiquement chaque lundi et envoyé comme notification `weekly_report` (in-app selon les préférences).
:::
