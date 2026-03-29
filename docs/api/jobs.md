# API — Jobs

---

## Lister les jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filtrer par statut (`pending`, `active`, `completed`, `failed`, `cancelled`) |
| `accountId` | Filtrer par compte Gmail |

**Réponse**
```json
[
  {
    "id": "uuid",
    "bullmq_id": "bulk_operation-1234567890",
    "type": "bulk_operation",
    "status": "active",
    "progress": 45,
    "total": 200,
    "processed": 90,
    "gmail_account_id": "uuid",
    "payload": { "action": "trash", "messageIds": [...] },
    "error": null,
    "created_at": "2024-03-15T12:00:00Z",
    "completed_at": null
  }
]
```

---

## Détail d'un job

### GET /api/jobs/:jobId

Retourne le job avec son état BullMQ live en plus.

```json
{
  "...": "champs de la table jobs",
  "bullmqState": "active"
}
```

---

## Annuler un job

### DELETE /api/jobs/:jobId

Annule le job dans BullMQ et met à jour le statut en `cancelled`.

**Réponse 204** — No content

!!! note
    Un job `active` (déjà en cours d'exécution dans le worker) ne peut pas être stoppé immédiatement. L'annulation prend effet entre deux batches.
