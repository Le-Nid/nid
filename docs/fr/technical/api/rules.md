# API — Règles automatiques

Toutes les routes `/:accountId/...` exigent le JWT et la propriété du compte Gmail. Toute requête d'écriture réussie republie les compteurs du flux `/api/events` (`activeRules`).

---

## Lister les règles

### GET /api/rules/:accountId

Retourne toutes les règles du compte Gmail.

### GET /api/rules/:accountId/stats

Indicateurs « Règles actives » de la vue d'ensemble.

**Réponse 200**
```json
{ "active": 3, "processed30d": 1250 }
```

`processed30d` : somme des mails traités par les exécutions `run_rule` terminées (manuelles et planifiées) sur 30 jours.

### GET /api/rules/:accountId/:ruleId

Retourne une règle. `404` si elle n'existe pas pour ce compte.

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
| `older_than` | Ancienneté minimale | `equals` (ex: `7d`, `3m`, `1y`) |
| `newer_than` | Ancienneté maximale | `equals` (ex: `7d`, `3m`, `1y`) |

Une combinaison champ/opérateur non prise en charge est refusée (`400`). `name` : 1 à 255 caractères.

**Réponse 201** : la règle créée.

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
{ "jobId": "run_rule-1234567890", "runAt": "2026-10-20T12:00:10.000Z", "message": "Rule execution enqueued" }
```

Corps optionnel `{ "delayMs": 10000 }` : Délai avant exécution (0–60000 ms, défaut `10000`). Pendant ce délai le job est `scheduled` et peut être annulé avec `DELETE /api/jobs/:jobId` (annuler). Envoyer `0` pour exécuter immédiatement.

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
  "estimatedCount": 342,
  "samples": [
    { "id": "abc123", "from": "news@exemple.com", "subject": "Les nouveautés", "date": "Mon, 01 Mar 2024 10:00:00 +0000" }
  ],
  "sizeBytes": 15600000
}
```

`samples` : jusqu'à 5 mails correspondants ; `sizeBytes` : taille estimée (taille moyenne des échantillons × `estimatedCount`).

::: tip Toujours prévisualiser avant de créer
Le preview traduit vos conditions en requête Gmail native et vous donne une estimation du nombre de mails affectés. Utile pour éviter les surprises avec des actions irréversibles comme `delete`.
:::

---

## Templates de règles

### GET /api/rules/templates

Retourne la bibliothèque de règles pré-configurées, organisée par catégorie.

**Réponse**
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

Catégories disponibles : `cleanup`, `archive`, `organize`, `label`, `expire`. Les templates `label` portent un champ `label: { "name": "Factures" }` : le libellé Gmail est trouvé ou créé à la création de la règle.

### POST /api/rules/:accountId/from-template

Crée une règle à partir d'un template. Idempotent : si une règle issue de ce template existe déjà pour le compte, elle est renvoyée telle quelle (`200`).

**Body**
```json
{ "templateId": "cleanup-github-notifications" }
```

**Réponse 201** : la règle créée. **Réponse 404** : template inconnu.
