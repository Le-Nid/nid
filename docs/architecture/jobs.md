# Jobs & Queue (BullMQ)

## Pourquoi BullMQ

Les opérations sur Gmail (bulk delete, archivage de 5 000 mails) peuvent prendre plusieurs minutes. Une requête HTTP synchrone timeouterait inévitablement.

BullMQ permet :

- Enqueue du job → réponse `202 Accepted` immédiate avec un `jobId`
- Exécution asynchrone dans un worker
- Polling du frontend sur `/api/jobs/:id` pour la progression
- Retry automatique en cas d'erreur (backoff exponentiel, 3 tentatives)
- Annulation d'un job en cours

---

## Types de jobs

| Type | Worker | Déclencheur |
|---|---|---|
| `bulk_operation` | `bulk.worker.ts` | POST `/api/gmail/:id/messages/bulk` |
| `archive_mails` | `archive.worker.ts` | POST `/api/archive/:id/archive` |
| `run_rule` | *(à implémenter v1.1)* | Manuel ou cron |
| `sync_dashboard` | *(à implémenter v1.1)* | Cron ou à la demande |

---

## Configuration de la queue

```typescript
// Queue partagée "gmail-manager"
defaultJobOptions: {
  attempts: 3,                              // 3 tentatives en cas d'échec
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
  removeOnComplete: { count: 100 },         // Garder les 100 derniers jobs complétés
  removeOnFail: { count: 50 },             // Garder les 50 derniers jobs en erreur
}
```

---

## Concurrence

| Worker | Concurrence | Raison |
|---|---|---|
| `bulk.worker` | 3 | Opérations rapides, peu de I/O disque |
| `archive.worker` | 1 | Écriture disque intensive, limiter la pression NAS |

---

## Tracking en base de données

Chaque job est tracké dans la table `jobs` (PostgreSQL) pour :

- Persistance après redémarrage (BullMQ Redis peut être vidé)
- Accès à l'historique même après `removeOnComplete`
- Affichage dans le frontend sans dépendance directe à Redis

```
pending → active → completed
                → failed
         → cancelled (annulation manuelle)
```

---

## Polling frontend

La page Jobs poll l'API toutes les **3 secondes** si au moins un job est `active` ou `pending`. Ce polling s'arrête automatiquement quand tous les jobs sont dans un état terminal.

Pour une meilleure UX en v1.3, remplacer par des **WebSockets** (Server-Sent Events ou `ws`) pour du push en temps réel.
