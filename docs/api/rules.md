# API — Règles automatiques

---

## Lister les règles

### GET /api/rules/:accountId

Retourne toutes les règles du compte Gmail.

---

## Créer une règle

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

### Champs de condition disponibles

| Field | Description | Opérateurs |
|---|---|---|
| `from` | Expéditeur | `contains`, `not_contains`, `equals`, `not_equals` |
| `to` | Destinataire | `contains`, `not_contains`, `equals`, `not_equals` |
| `subject` | Sujet | `contains`, `not_contains`, `equals`, `not_equals` |
| `has_attachment` | A une pièce jointe | `is_true` |
| `size_gt` | Taille supérieure (octets) | `gt` |
| `size_lt` | Taille inférieure (octets) | `lt` |
| `label` | Label Gmail | `equals`, `not_equals` |

### Actions disponibles

| Type | Description |
|---|---|
| `trash` | Corbeille Gmail |
| `delete` | Suppression définitive ⚠️ |
| `label` | Ajouter un label (`labelId` requis) |
| `unlabel` | Retirer un label (`labelId` requis) |
| `archive` | Retirer de l'INBOX |
| `archive_nas` | Archiver sur le NAS (EML) |
| `mark_read` | Marquer comme lu |
| `mark_unread` | Marquer comme non lu |

### Planifications

| Valeur | Fréquence |
|---|---|
| `null` | Manuel uniquement |
| `hourly` | Toutes les heures |
| `daily` | Chaque jour |
| `weekly` | Chaque semaine |
| `monthly` | Chaque mois |

---

## Modifier une règle

### PUT /api/rules/:accountId/:ruleId

Mêmes champs que la création, tous optionnels.

---

## Activer / désactiver

### PATCH /api/rules/:accountId/:ruleId/toggle

Inverse le statut `is_active` de la règle.

**Réponse** : règle mise à jour.

---

## Supprimer une règle

### DELETE /api/rules/:accountId/:ruleId

**Réponse 204**

---

## Exécuter manuellement

### POST /api/rules/:accountId/:ruleId/run

Lance l'exécution de la règle via BullMQ (asynchrone).

**Réponse 202**
```json
{ "jobId": "run_rule-1234567890", "message": "Rule execution enqueued" }
```

---

## Prévisualiser

### POST /api/rules/:accountId/preview

Compte les mails qui matcheraient les conditions **sans** appliquer d'action.

**Body**
```json
{ "conditions": [...] }
```

**Réponse**
```json
{
  "query": "from:(newsletter) -has:attachment",
  "estimatedCount": 342
}
```

!!! tip "Toujours prévisualiser avant de créer"
    Le preview traduit vos conditions en requête Gmail native et vous donne une estimation du nombre de mails affectés. Utile pour éviter les surprises avec des actions irréversibles comme `delete`.
