# Jobs & Queue (BullMQ)

## Pourquoi BullMQ

Les opérations sur Gmail (action de masse, archivage de milliers de mails) peuvent prendre plusieurs minutes. Une requête HTTP synchrone timeouterait inévitablement.

BullMQ permet :

- Enqueue du job → réponse `202 Accepted` immédiate avec un `jobId`
- Exécution asynchrone dans un worker
- Suivi de la progression en SSE
- Retry automatique en cas d'erreur (backoff exponentiel, 3 tentatives)
- Annulation d'un job tant qu'il n'a pas démarré

---

## Types de jobs

`JobType` (`backend/src/jobs/queue.ts`). Tous les types sont traités par le **worker unifié** (`jobs/workers/unified.worker.ts`), qui dispatche par `job.name` :

| Type | Enfilé par |
|---|---|
| `bulk_operation` | `POST /api/gmail/:accountId/messages/bulk` (ids ou requête Gmail) ; `POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete` ; `runRule()` pour les actions Gmail |
| `archive_mails` | `POST /api/archive/:accountId/archive` ; `runRule()` pour l'action `archive_nas` ; scheduler (sauvegarde NAS automatique) ; le worker lui-même (suite d'une sauvegarde plafonnée) |
| `run_rule` | `POST /api/rules/:accountId/:ruleId/run` ; scheduler (règles planifiées) |
| `scan_unsubscribe` | `POST /api/unsubscribe/:accountId/scan` |
| `integrity_check` | `POST /api/integrity/check/async` (admin) ; scheduler (quotidien, 3 h) |
| `encrypt_archives` | `POST /api/privacy/:accountId/encryption/encrypt` |
| `import_mbox` | `POST /api/import/:accountId/mbox` |
| `import_imap` | `POST /api/import/:accountId/imap` |
| `purge_archive_trash` | scheduler (quotidien, 4 h) |
| `backfill_body_text` | scheduler, une fois au démarrage s'il reste des archives sans `body_text` |
| `apply_retention` | Aucun appelant actuellement : `POST /api/retention/run` applique les politiques de façon synchrone |

`POST /api/jobs/:jobId/retry` peut ré-enfiler n'importe quel type (voir [Relance](#relance)).

---

## Configuration de la queue

```typescript
// Queue partagée "nid"
defaultJobOptions: {
  attempts: 3,                                   // 3 tentatives en cas d'échec
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
  removeOnComplete: { count: 100 },              // Garder les 100 derniers jobs complétés
  removeOnFail: { count: 50 },                   // Garder les 50 derniers jobs en erreur
}
```

`enqueueJob(type, payload, opts)` accepte deux options :

- `dedupId` : tant qu'un job avec cet id attend ou tourne, un nouvel enqueue est ignoré (règles planifiées, sauvegardes, backfill).
- `delay` (ms) : le job reste `scheduled` (BullMQ `delayed`) jusque-là et peut encore être annulé.

Les identifiants sensibles du payload (`passphrase`, `imapConfig.pass`) sont retirés de la copie stockée en base ; dans Redis, ces jobs sont supprimés dès leur fin.

---

## Concurrence

Le worker unifié a une concurrence de **3** (3 jobs simultanés max), partagée par tous les types. Les appels Gmail sont en plus limités par compte (`gmail/gmail-throttle.ts`).

---

## Tracking en base de données

Chaque job est tracké dans la table `jobs` (PostgreSQL) pour :

- Persistance après redémarrage (BullMQ Redis peut être vidé)
- Accès à l'historique même après `removeOnComplete`
- Affichage dans le frontend sans dépendance directe à Redis

### Pré-insertion

`enqueueJob()` insère immédiatement une ligne dans `jobs` (`status: 'pending'`, ou `'scheduled'` avec `delay`), sauf si BullMQ a dédupliqué le job. Le frontend (SSE) trouve donc le job sans délai.

Les handlers font ensuite un `UPDATE` (et non un `INSERT`) pour passer le job en `active`, puis `completed` ou `failed`.

```
pending   → active → completed
scheduled ↗        → failed
pending / scheduled → cancelled (annulation manuelle ; 409 une fois active)
```

`GET /api/jobs` liste les jobs de l'utilisateur sur 30 jours (filtres `status` en liste séparée par des virgules, `accountId`, `limit` ; `withCounts=true` ajoute le décompte par statut pour la page Activité).

---

## Fenêtre d'annulation

Les actions destructrices sont enfilées avec `delay = delayMs` (corps de requête, **10 s par défaut**, 0 à 60 s) :

- `POST /api/gmail/:accountId/messages/bulk`
- `POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete`
- `POST /api/rules/:accountId/:ruleId/run`

La réponse contient le `jobId` BullMQ et `runAt`. Pendant ce délai, `DELETE /api/jobs/:jobId` (id BullMQ ou id de ligne) retire le job de la queue et passe la ligne en `cancelled`. Un job déjà `active` ne peut pas être arrêté : la route répond **409**. Côté frontend, `UndoToast` affiche le compte à rebours.

---

## Relance

`POST /api/jobs/:jobId/retry` ré-enfile le payload stocké sous un nouvel id (`retryOf` = id de la ligne d'origine) et répond `202 { jobId, retryOf }`. Les types dont les identifiants ne sont pas stockés (`import_imap`, `encrypt_archives`) sont refusés en **409** : il faut les relancer depuis leur page.

Les actions de masse plafonnées (`BULK_QUERY_MAX`, 50 000 par défaut) ne se relancent pas seules : une notification propose de relancer. Les sauvegardes NAS plafonnées enchaînent en revanche une suite différentielle après `ARCHIVE_CONTINUE_DELAY_MIN` minutes (15 par défaut), au plus `ARCHIVE_CHAIN_MAX` fois (20).

---

## Suivi temps réel (SSE)

### Par job : `GET /api/jobs/:jobId/events`

- `:jobId` = id BullMQ ou id de ligne ; le job doit appartenir à l'utilisateur (sinon 404)
- Envoie l'état courant de la ligne `jobs` à la connexion ; si le job est déjà terminé, envoie l'état final puis `event: close`
- Le broadcaster (`startQueueEventBroadcaster`) écoute les `QueueEvents` BullMQ (`progress`, `completed`, `failed`) et relit la ligne `jobs` (par `bullmq_id`) avant de diffuser `{ status, progress, processed, total }`
- Heartbeat toutes les 15 s
- Côté frontend : `useJobSSE(jobId)` (reconnexion avec backoff), affiché par `JobProgressInline`

### Par utilisateur : `GET /api/events`

Flux de l'utilisateur connecté, via un canal Redis pub/sub par utilisateur (`events/events.service.ts`) :

- `counters` à la connexion et à chaque changement : `{ mails, activeRules, activeJobs }`
- `job` quand un job démarre ou se termine (publié par le worker)
- Heartbeat toutes les 30 s
- Côté frontend : `useLiveCounters()` (badges de navigation)

Les toasts de fin de job viennent de `useGlobalJobNotifier` (poll des jobs actifs toutes les 5 s) et les notifications in-app de `notify()` côté worker.

---

## Scheduler

`startRuleScheduler()` (`jobs/scheduler.ts`) tourne toutes les **60 secondes** dans le processus API :

| Tâche | Fréquence | Mode |
|---|---|---|
| `integrity_check` | Quotidien (tick de 3 h) | Job |
| `purge_archive_trash` | Quotidien (tick de 4 h) | Job |
| Sauvegarde NAS automatique (`archive_mails` différentiel) | Selon `mail_accounts.backup_interval` (1h / 6h / 24h), comptes actifs avec `backup_enabled` et sans `auth_error_at` | Job, `dedupId: backup-<accountId>` |
| Règles planifiées (`run_rule`) | `hourly`, `daily`, `weekly`, `monthly` selon `rules.last_run_at` | Job, `dedupId: run_rule-<ruleId>` |
| `backfill_body_text` | Une fois au démarrage, s'il reste des archives à remplir | Job |
| Snapshots Inbox Zero | Toutes les 6 h | Dans le processus |
| Synchro des libellés Gmail (`syncAllLabels()`) | Quotidien (premier tick après le démarrage) | Dans le processus — voir [API — Libellés](api/labels.md) |
| Mails expirés (`processExpiredEmails()`) | Toutes les 15 min | Dans le processus |
| Liens de partage expirés (`cleanupExpiredShares()`) | Toutes les heures | Dans le processus |

`startReportScheduler()` (`reports/report.scheduler.ts`) vérifie toutes les heures et génère, le lundi, le rapport hebdomadaire de chaque utilisateur sous forme de notification.

### Purge de la corbeille archives

Le job `purge_archive_trash` :

1. Lit la configuration depuis la table `system_config` (`archive_trash_retention_days`, `archive_trash_purge_enabled`)
2. Si désactivé (`purge_enabled = false`), le job se termine sans action
3. Recherche les mails archivés dont `deleted_at < maintenant - retention_days`
4. Supprime les fichiers associés (EML + pièces jointes) du stockage
5. Supprime les entrées en base de données

La rétention par défaut est de **30 jours**. Elle est configurable par un admin (`PUT /api/archive/config/trash`) ou directement dans la table `system_config`.
