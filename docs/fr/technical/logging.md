# Logging

Nid utilise un système de logging structuré basé sur [Pino](https://github.com/pinojs/pino) côté backend et un logger console léger côté frontend.

## Backend

### Logger centralisé

Tous les modules backend utilisent le **logger centralisé** défini dans `backend/src/logger.ts` :

```typescript
import { createLogger } from '../logger'

const logger = createLogger('mon-module')

logger.info({ accountId, messageId }, 'archiving mail')
logger.error({ err }, 'operation failed')
logger.debug({ data }, 'debug info')
logger.warn('something unusual happened')
```

`createLogger(name)` crée un *child logger* Pino qui :
- Hérite du **niveau de log** défini par `LOG_LEVEL`
- Utilise **pino-pretty** en développement (sortie colorée et lisible)
- Produit du **JSON structuré** en production (pour intégration avec des outils comme Loki, ELK, Datadog)
- Inclut automatiquement le nom du module dans chaque ligne de log

### Configuration

| Variable | Défaut | Description |
|----------|--------|-------------|
| `LOG_LEVEL` | `info` | Niveau minimum : `debug`, `info`, `warn`, `error`, `silent` |
| `NODE_ENV` | `development` | En `development`, active pino-pretty |

### Bonnes pratiques

- **Toujours passer le contexte en objet** : `logger.info({ accountId, jobId }, 'message')` plutôt que `logger.info('message ' + accountId)`
- **Logger les erreurs avec `err`** : `logger.error({ err }, 'description')` — Pino sérialise automatiquement le stack trace
- **Utiliser `debug` pour le détail** : les informations de debug ne sont visibles qu'avec `LOG_LEVEL=debug`
- **Ne jamais logger de données sensibles** : pas de tokens, mots de passe, clés API

### Modules loggés

| Module | Fichier | Opérations loggées |
|--------|---------|-------------------|
| `archive` | `archive/archive.service.ts` | Archivage de mails, extraction PJ |
| `archive-worker` | `jobs/workers/archive.worker.ts` | Progression archivage batch |
| `bulk-worker` | `jobs/workers/bulk.worker.ts` | Opérations bulk (trash, delete, modify) |
| `rule-worker` | `jobs/workers/rule.worker.ts` | Exécution de règles |
| `rules` | `rules/rules.service.ts` | CRUD règles, exécution |
| `oauth` | `auth/oauth.service.ts` | Échange de tokens, refresh |
| `social-auth` | `auth/social.service.ts` | Auth multi-provider |
| `gmail` | `gmail/gmail.service.ts` | Appels Gmail API |
| `gmail-throttle` | `gmail/gmail-throttle.ts` | Rate limiting, retries |
| `worker` | `jobs/workers/unified.worker.ts` | Dispatch des jobs |
| `scheduler` | `jobs/scheduler.ts` | Planification des règles |
| `db` | `db/index.ts` | Migrations |
| `analytics` | `analytics/analytics.service.ts` | Heatmap, scores, suggestions |
| `dedup` | `archive/dedup.service.ts` | Déduplication PJ |
| `export` | `archive/export.service.ts` | Export ZIP |
| `import` | `archive/import.service.ts` | Import mbox/IMAP |
| `integrity` | `archive/integrity.service.ts` | Vérification intégrité |
| `retention` | `archive/retention.service.ts` | Politiques de rétention |
| `sharing` | `archive/sharing.service.ts` | Partage temporaire |
| `storage` | `storage/storage.service.ts` | Backend stockage (local/S3) |
| `quota` | `gmail/quota.service.ts` | Suivi quota API |
| `reports` | `reports/report.service.ts` | Rapports hebdo |
| `report-scheduler` | `reports/report.scheduler.ts` | Planification rapports |
| `notify` | `notifications/notify.ts` | Notifications multi-canal |
| `webhook` | `webhooks/webhook.service.ts` | Dispatch webhooks |
| `audit` | `audit/audit.service.ts` | Audit log |
| `expiration` | `expiration/expiration.service.ts` | Expiration des mails |
| `encryption` | `privacy/encryption.service.ts` | Chiffrement archives |
| `pii-scanner` | `privacy/pii.service.ts` | Détection PII |
| `tracking-pixel` | `privacy/tracking.service.ts` | Détection pixels espions |
| `unsubscribe` | `unsubscribe/unsubscribe.service.ts` | Scan newsletters |
| `job-sse` | `routes/job-sse.ts` | SSE broadcast |
| `mcp` | `mcp-server.ts` | Serveur MCP |

### Gestion des erreurs Fastify

Le handler d'erreur global (`plugins/index.ts`) logue automatiquement :
- Les **erreurs de validation Zod** (niveau `warn`) avec les détails
- Les **erreurs client** (4xx, niveau `warn`)
- Les **erreurs serveur** (5xx, niveau `error`) avec l'URL, la méthode et l'ID utilisateur

## Frontend

### Logger

Le frontend utilise un logger léger défini dans `frontend/src/utils/logger.ts` :

```typescript
import { createLogger } from '../utils/logger'

const logger = createLogger('mon-composant')

logger.info('Action effectuée', { page: 'dashboard' })
logger.error('Erreur API', { url, status })
```

- **En production** : seuls `warn` et `error` sont affichés
- **En développement** : tous les niveaux sont actifs

### Error Boundary

Un composant `ErrorBoundary` (`components/ErrorBoundary.tsx`) capture les erreurs React non gérées et les logue avec le component stack.

### Interception API

Le client Axios (`api/client.ts`) logue automatiquement :
- Les erreurs **401** (niveau `warn`)
- Les erreurs **5xx** (niveau `error`)
- Les erreurs **réseau** (niveau `error`)

### Erreurs globales

`main.tsx` capture et logue :
- Les erreurs non gérées (`window.onerror`)
- Les rejections de Promise non gérées (`unhandledrejection`)
