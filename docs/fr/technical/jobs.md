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

Tous les types de jobs sont traités par un **worker unifié** (`unified.worker.ts`) qui dispatche par `job.name` :

| Type | Déclencheur |
|---|---|
| `bulk_operation` | POST `/api/gmail/:id/messages/bulk` |
| `archive_mails` | POST `/api/archive/:id/archive` |
| `run_rule` | Manuel ou cron (depuis la page Règles) |
| `scan_unsubscribe` | POST `/api/unsubscribe/:id/scan` |
| `scan_tracking` | POST `/api/privacy/:id/tracking/scan` |
| `scan_pii` | POST `/api/privacy/:id/pii/scan` |
| `encrypt_archives` | POST `/api/privacy/:id/encryption/encrypt` |
| `import_mbox` | POST `/api/import/:id/mbox` |
| `import_imap` | POST `/api/import/:id/imap` |
| `apply_retention` | POST `/api/retention/run` |
| `purge_archive_trash` | Job planifié quotidien (`scheduler.ts`, 4h du matin) |

---

## Configuration de la queue

```typescript
// Queue partagée "nid"
defaultJobOptions: {
  attempts: 3,                              // 3 tentatives en cas d'échec
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
  removeOnComplete: { count: 100 },         // Garder les 100 derniers jobs complétés
  removeOnFail: { count: 50 },             // Garder les 50 derniers jobs en erreur
}
```

---

## Concurrence

Le worker unifié est configuré avec une concurrence de **3** (3 jobs simultanés max). Tous les types de jobs partagent cette concurrence.

---

## Tracking en base de données

Chaque job est tracké dans la table `jobs` (PostgreSQL) pour :

- Persistance après redémarrage (BullMQ Redis peut être vidé)
- Accès à l'historique même après `removeOnComplete`
- Affichage dans le frontend sans dépendance directe à Redis

### Pré-insertion

La fonction `enqueueJob()` insère immédiatement une ligne dans la table `jobs` avec `status: 'pending'` dès l'ajout du job à BullMQ. Cela garantit que le frontend (SSE) peut trouver le job dans la base de données sans délai, avant même que le worker ne le prenne en charge.

Les workers font ensuite un `UPDATE` (et non un `INSERT`) pour passer le job en `active`, puis `completed` ou `failed`.

```
pending → active → completed
                → failed
         → cancelled (annulation manuelle)
```

---

## Suivi temps réel (SSE)

Le suivi de progression utilise les **Server-Sent Events** via le endpoint `GET /api/jobs/events` :

- Le hook `useJobSSE` ouvre une connexion SSE persistante
- Chaque événement contient `{ jobId, status, progress, processed, total }`
- Le broadcaster SSE interroge la base de données (via `bullmq_id`) à chaque événement de progression pour récupérer l'état complet du job
- La connexion se reconnecte automatiquement en cas de coupure
- Un `JobProgressModal` affiche la barre de progression en temps réel
- Le composant `NotificationBell` reçoit également les événements pour les notifications toast

---

## Scheduler

Le fichier `scheduler.ts` exécute des vérifications périodiques (toutes les 60 secondes) et enqueue des jobs planifiés :

| Job | Fréquence | Description |
|---|---|---|
| `apply_retention` | Quotidien (3h) | Applique les politiques de rétention actives |
| `purge_archive_trash` | Quotidien (4h) | Supprime définitivement les archives en corbeille expirées |

### Purge de la corbeille archives

Le job `purge_archive_trash` :

1. Lit la configuration depuis la table `system_config` (`archive_trash_retention_days`, `archive_trash_purge_enabled`)
2. Si désactivé (`purge_enabled = false`), le job se termine sans action
3. Recherche les mails archivés dont `deleted_at < maintenant - retention_days`
4. Supprime les fichiers associés (EML + pièces jointes) du stockage
5. Supprime les entrées en base de données

La rétention par défaut est de **30 jours**. Elle est configurable via l'interface (page Jobs → Configuration de la corbeille archives) ou directement dans la table `system_config`.
