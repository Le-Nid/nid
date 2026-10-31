# API — Jobs

---

## Lister les jobs

### GET /api/jobs

**Query params**

| Param | Description |
|---|---|
| `status` | Filtrer par statut, liste séparée par des virgules (`pending`, `scheduled`, `active`, `completed`, `failed`, `cancelled`) |
| `accountId` | Filtrer par compte Gmail (UUID) ; absent = tous les comptes |
| `limit` | Nombre de jobs (1–500, défaut 50) |
| `withCounts` | `true` : réponse `{ jobs, counts }`, `counts` = nombre de jobs par statut pour le même compte (`{ "failed": 1, ... }`) |

Seuls les jobs des 30 derniers jours sont renvoyés.

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
    "account_id": "uuid",
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

---

## Relancer un job

### POST /api/jobs/:jobId/retry

Remet en file le payload enregistré du job sous un **nouvel** id (bouton « Relancer », par exemple après une action de masse arrêtée à `BULK_QUERY_MAX`). `:jobId` est l'`id` de la ligne ou l'id BullMQ. Le nouveau job appartient à l'appelant et son payload porte `retryOf` (id de ligne du job d'origine). Il s'exécute immédiatement (pas de délai d'annulation).

**Réponse 202**
```json
{ "jobId": "bulk_operation-<uuid>", "retryOf": "<uuid de ligne>" }
```

**Réponse 404** — job inconnu ou appartenant à un autre utilisateur.

**Réponse 409** — `import_imap` et `encrypt_archives` : leurs identifiants sont retirés du payload enregistré, il faut les relancer depuis leur page.

---

## Suivi d'un job (SSE)

### GET /api/jobs/:jobId/events

Flux `text/event-stream` de la progression d'un job de l'utilisateur. `:jobId` est l'`id` de la ligne ou l'id BullMQ.

- À l'ouverture : un message `data:` avec la ligne complète du job.
- Si le job est déjà `completed`, `failed` ou `cancelled` : la ligne finale, puis un événement `close`, et le flux se ferme.
- Ensuite, à chaque événement BullMQ : `data: { "bullmqId", "event": "progress", "status", "progress", "processed", "total" }`, `event: "completed"` (avec `progress: 100`) ou `event: "failed"` (avec `error`).
- Un commentaire `: heartbeat` toutes les 15 s.

**Réponse 404** — job inconnu ou appartenant à un autre utilisateur.

---

## Événements en direct

### GET /api/events

Flux `text/event-stream` authentifié de l'utilisateur connecté (compteurs de la sidebar, D6). Événements :

| Événement | Quand | Données |
|---|---|---|
| `counters` | à la connexion, au début et à la fin de chaque job de l'utilisateur, après création/modification/suppression d'une règle | `{ "mails": { "<accountId>": 48212 }, "activeRules": 3, "activeJobs": 1 }` |
| `job` | un job de l'utilisateur démarre ou se termine (avant le `counters` correspondant) | `{ "jobId", "type", "accountId", "phase": "started" \| "finished", "failed" }` |

`mails` = `messagesTotal` Gmail par compte actif (`null` si Gmail n'a pas répondu). `activeJobs` compte les jobs au statut `active`. Pas encore de `cleanupBytes` : il demande un scan des tailles de la boîte. Un commentaire `: heartbeat` est envoyé toutes les 30 s. Les événements passent par Redis pub/sub (canal `nid:events:<userId>`) : worker et API peuvent tourner dans des processus distincts ; rien n'est calculé tant que l'utilisateur n'a aucun flux ouvert.

**Réponse 401** — pas de session valide.
