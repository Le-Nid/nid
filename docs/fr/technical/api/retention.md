# API — Politiques de rétention

Supprime définitivement les mails **archivés** (EML et pièces jointes) plus anciens qu'un âge donné, éventuellement limités à un compte et à un libellé. Les mails dans Gmail ne sont pas touchés.

Toutes les routes nécessitent une authentification JWT et ne portent que sur les politiques de l'utilisateur.

---

## Lister les politiques

### GET /api/retention

**Réponse 200**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "account_id": null,
    "name": "Archives > 2 ans",
    "label": null,
    "max_age_days": 730,
    "is_active": true,
    "last_run_at": "2026-03-20T02:00:00Z",
    "deleted_count": 142,
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-03-20T02:00:00Z"
  }
]
```

---

## Créer une politique

### POST /api/retention

**Body**
```json
{
  "name": "Newsletters > 6 mois",
  "gmailAccountId": "uuid",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 180
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | string | Oui | Nom descriptif de la politique |
| `gmailAccountId` | string | Non | Cibler un compte spécifique (tous si omis) |
| `label` | string | Non | Cibler un libellé Gmail : son id, qui doit exister dans les libellés synchronisés du compte (de l'un des comptes de l'utilisateur si `gmailAccountId` est absent), sinon `400` — voir [labels.md](labels.md). Même contrôle sur `PUT` ; `""` le retire |
| `maxAgeDays` | number | Oui | Âge maximum en jours (>= 1), comparé à la date du mail |

**Réponse 201** : la politique créée. **Réponse 400** : `name` ou `maxAgeDays` manquant, ou libellé inconnu.

---

## Modifier une politique

### PUT /api/retention/:policyId

**Body (partiel)**
```json
{
  "name": "Newsletters > 3 mois",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 90,
  "isActive": false
}
```

**Réponse 200** : la politique mise à jour.

---

## Supprimer une politique

### DELETE /api/retention/:policyId

**Réponse 204** — No content

---

## Exécuter maintenant

### POST /api/retention/run

Exécute immédiatement toutes les politiques actives de l'utilisateur (synchrone).

**Réponse 200**
```json
{
  "policiesRun": 2,
  "totalDeleted": 47
}
```
