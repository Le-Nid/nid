# Logging

Nid uses a structured logging system based on [Pino](https://github.com/pinojs/pino) on the backend and a lightweight console logger on the frontend.

## Backend

### Centralized Logger

All backend modules use the **centralized logger** defined in `backend/src/logger.ts`:

```typescript
import { createLogger } from '../logger'

const logger = createLogger('mon-module')

logger.info({ accountId, messageId }, 'archiving mail')
logger.error({ err }, 'operation failed')
logger.debug({ data }, 'debug info')
logger.warn('something unusual happened')
```

`createLogger(name)` creates a Pino *child logger* that:
- Inherits the **log level** defined by `LOG_LEVEL`
- Uses **pino-pretty** in development (colorized and readable output)
- Produces **structured JSON** in production (for integration with tools like Loki, ELK, Datadog)
- Automatically includes the module name in every log line

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum level: `debug`, `info`, `warn`, `error`, `silent` |
| `NODE_ENV` | `development` | In `development`, activates pino-pretty |

### Best Practices

- **Always pass context as an object**: `logger.info({ accountId, jobId }, 'message')` rather than `logger.info('message ' + accountId)`
- **Log errors with `err`**: `logger.error({ err }, 'description')` — Pino automatically serializes the stack trace
- **Use `debug` for details**: debug information is only visible with `LOG_LEVEL=debug`
- **Never log sensitive data**: no tokens, passwords, API keys

### Logged Modules

| Module | File | Logged Operations |
|--------|------|-------------------|
| `archive` | `archive/archive.service.ts` | Email archiving, attachment extraction |
| `archive-worker` | `jobs/workers/archive.worker.ts` | Batch archiving progress |
| `bulk-worker` | `jobs/workers/bulk.worker.ts` | Bulk operations (trash, delete, modify) |
| `rule-worker` | `jobs/workers/rule.worker.ts` | Rule execution |
| `rules` | `rules/rules.service.ts` | Rules CRUD, execution |
| `oauth` | `auth/oauth.service.ts` | Token exchange, refresh |
| `social-auth` | `auth/social.service.ts` | Multi-provider auth |
| `gmail` | `gmail/gmail.service.ts` | Gmail API calls |
| `gmail-throttle` | `gmail/gmail-throttle.ts` | Rate limiting, retries |
| `worker` | `jobs/workers/unified.worker.ts` | Job dispatch |
| `scheduler` | `jobs/scheduler.ts` | Rule scheduling |
| `db` | `db/index.ts` | Migrations |
| `analytics` | `analytics/analytics.service.ts` | Heatmap, scores, suggestions |
| `dedup` | `archive/dedup.service.ts` | Attachment deduplication |
| `export` | `archive/export.service.ts` | ZIP export |
| `import` | `archive/import.service.ts` | mbox/IMAP import |
| `integrity` | `archive/integrity.service.ts` | Integrity verification |
| `retention` | `archive/retention.service.ts` | Retention policies |
| `sharing` | `archive/sharing.service.ts` | Temporary sharing |
| `storage` | `storage/storage.service.ts` | Storage backend (local/S3) |
| `quota` | `gmail/quota.service.ts` | API quota tracking |
| `reports` | `reports/report.service.ts` | Weekly reports |
| `report-scheduler` | `reports/report.scheduler.ts` | Report scheduling |
| `notify` | `notifications/notify.ts` | Multi-channel notifications |
| `webhook` | `webhooks/webhook.service.ts` | Webhook dispatch |
| `audit` | `audit/audit.service.ts` | Audit log |
| `expiration` | `expiration/expiration.service.ts` | Email expiration |
| `encryption` | `privacy/encryption.service.ts` | Archive encryption |
| `pii-scanner` | `privacy/pii.service.ts` | PII detection |
| `tracking-pixel` | `privacy/tracking.service.ts` | Tracking pixel detection |
| `unsubscribe` | `unsubscribe/unsubscribe.service.ts` | Newsletter scan |
| `job-sse` | `routes/job-sse.ts` | SSE broadcast |
| `mcp` | `mcp-server.ts` | MCP server |

### Fastify Error Handling

The global error handler (`plugins/index.ts`) automatically logs:
- **Zod validation errors** (`warn` level) with details
- **Client errors** (4xx, `warn` level)
- **Server errors** (5xx, `error` level) with the URL, method, and user ID

## Frontend

### Logger

The frontend uses a lightweight logger defined in `frontend/src/utils/logger.ts`:

```typescript
import { createLogger } from '../utils/logger'

const logger = createLogger('mon-composant')

logger.info('Action effectuée', { page: 'dashboard' })
logger.error('Erreur API', { url, status })
```

- **In production**: only `warn` and `error` are displayed
- **In development**: all levels are active

### Error Boundary

An `ErrorBoundary` component (`components/ErrorBoundary.tsx`) captures unhandled React errors and logs them with the component stack.

### API Interception

The Axios client (`api/client.ts`) automatically logs:
- **401** errors (`warn` level)
- **5xx** errors (`error` level)
- **Network** errors (`error` level)

### Global Errors

`main.tsx` captures and logs:
- Unhandled errors (`window.onerror`)
- Unhandled Promise rejections (`unhandledrejection`)
