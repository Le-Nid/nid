# API — Jobs

---

## Lister les jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filtrer par statut (`pending`, `scheduled`, `active`, `completed`, `failed`, `cancelled`) |
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

Retire le job de BullMQ et met à jour le statut en `cancelled`. `:jobId` est l'`id` de la ligne ou l'id BullMQ renvoyé par les endpoints d'enfilement (`jobId`) : un job `scheduled` (différé) peut ainsi être annulé avant `runAt` (annuler).

**Réponse 204** — No content

**Réponse 409** — le job est déjà `active` (en cours dans le worker) et ne peut pas être annulé.

**Réponse 404** — job inconnu ou appartenant à un autre utilisateur.
