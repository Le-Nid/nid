# Roadmap

## v1.0 — MVP (✅ completed)

- [x] Local JWT auth
- [x] OAuth2 Gmail multi-account
- [x] Full Docker setup
- [x] PostgreSQL schema
- [x] BullMQ queue + bulk & archive workers
- [x] Differential EML archiving
- [x] Full REST API (auth, gmail, archive, dashboard, jobs)
- [x] Frontend layout + auth UI
- [x] Dashboard with charts (Ant Design Charts)
- [x] Mail management page (list, filters, bulk ops, reading)
- [x] Archives page (list, search, EML reading, attachments)
- [x] Jobs page (progress tracking, cancellation)
- [x] Settings page (Gmail account connection)

## v1.1 — Automatic Rules (✅ completed)

- [x] Shared types `RuleCondition` / `RuleAction` (backend + frontend)
- [x] Service `rules.service.ts` — CRUD + condition to native Gmail query conversion
- [x] Worker `rule.worker.ts` — BullMQ execution
- [x] Cron scheduler — scheduled execution (hourly/daily/weekly/monthly)
- [x] Full API routes (CRUD + toggle + run + preview)
- [x] UI — Rules page with table, active/inactive toggle, manual execution
- [x] UI — `RuleFormModal` with condition builder, preview before creation
- [x] API documentation `rules.md`

## v1.2 — Advanced Archives + Performance (✅ completed)

- [x] Selective ZIP export of archives (EML + attachments, chunked streaming)
- [x] Inline HTML preview of archived emails (extracted from EML, sandboxed iframe)
- [x] HTML / raw EML toggle in the archive viewer
- [x] Redis cache for dashboard stats (10min) and archive-stats (5min) — `?refresh=1` to force
- [x] SSE (Server-Sent Events) for real-time job tracking — replaces polling
- [x] `useJobSSE` React hook + `JobProgressModal` component
- [x] BullMQ QueueEvents → automatic SSE broadcast (progress, completed, failed)
- [x] Cache invalidation after archiving

## Kysely (✅ completed — retrofitted on v1.0-v1.2)

- [x] `db/types.ts` — fully typed `Database` interface (Generated, Selectable, Insertable)
- [x] `db/migrations/001_initial.ts` — full schema (extensions, tables, indexes, tsvector triggers)
- [x] `db/migrations/002_example_add_column.ts` — template for future migrations
- [x] `db/index.ts` — `InCodeMigrationProvider` + `runMigrations()` at startup
- [x] `plugins/db.ts` — migrations before Fastify decoration
- [x] All services/routes/workers rewritten with Kysely query builder
- [x] `postgres/init.sql` removed — migrations are the source of truth
- [x] `vite.config.ts` backend — `kysely` externalized

## v1.3 — UX & Performance (✅ completed)

- [x] **Infinite pagination** in MailManager (IntersectionObserver, `useInfiniteScroll`)
- [x] **Gmail operator autocomplete** — `GmailSearchInput` with 25 native operators
- [x] **Dark mode** — `useThemeStore` Zustand persisted in localStorage, reactive `ConfigProvider`
- [x] **Global job notifications** — `useGlobalJobNotifier` poll 5s + toast on completed/failed
- [x] **Attachment image preview** in Archive drawer (lazy loading, `mime_type.startsWith('image/')`)
- [x] `AntApp` wrapper for global access to Ant Design notification/message hooks

## v2.0 — Multi-user (✅ completed)

- [x] Strict data isolation per user (`requireAccountOwnership` middleware)
- [x] Role management (admin / user) — `role` in JWT, `requireAdmin` middleware
- [x] Admin page: global view of accounts, jobs, statistics, user management
- [x] Quotas and limits per user (`max_gmail_accounts`, `storage_quota_bytes`)
- [x] Authentication / sign-up via Google SSO (OAuth2 `openid profile email`)
- [x] DB migration `003_multiuser` — `role`, `google_id`, `is_active`, quotas, `user_id` on jobs columns
- [x] User profile in settings (avatar, quota, storage)
- [x] All routes secured with Gmail account ownership verification

## v2.1 — Cleanup, insights & robustness

### High value

- [x] **Unsubscribe Manager** — Scan `List-Unsubscribe` headers, dedicated page listing newsletters/mailing lists with volume and size, one-click unsubscribe + bulk deletion
- [x] **Scheduled automatic archiving** — Rule action `archive_nas` schedulable (e.g., archive everything > 6 months, every Sunday). `older_than` / `newer_than` conditions added to rules
- [x] **Attachment manager** — Dedicated page listing all attachments (live Gmail + archives) sorted by size, with search and sorting
- [x] **Weekly report / insights** — Insights page with weekly report + in-app notification system (bell in header, Monday scheduler)

### Quality of life

- [x] **Rule templates** — Library of pre-configured rules (e.g., "Clean up GitHub notifications", "Archive invoices > 3 months", "Delete unread newsletters > 30 days"). One click to activate
- [x] **Duplicate detection** — Identify duplicate emails (same subject + sender + date), offer grouped deletion
- [x] **Audit log** — `audit_logs(user_id, action, target, details, created_at)` table tracking sensitive actions (deletion, archiving, rule modifications)
- [x] **2FA / TOTP** — Two-factor authentication for local accounts (via `otplib`). Relevant for self-hosted app with Gmail mailbox access

### Nice to have

- [x] **Archive integrity check** — Scheduled job comparing archived EMLs ↔ PostgreSQL index, detecting missing or corrupted files
- [x] **Webhooks / external notifications** — Configurable webhooks (Discord, Slack, Ntfy) on events: failed job, rule executed, quota reached. Unified `notify()` dispatcher linking in-app + toast + webhooks
- [x] **Keyboard shortcuts** — In MailManager: `j/k` (navigation), `e` (archive), `#` (delete), `/` (search)
- [x] **Configuration export/import** — Export rules + settings as JSON, reimport on another instance
- [x] **Notification preferences** — 3-channel table (🔔 in-app, 💬 toast, 🔗 webhook) per event type, instant save

### Ops & deployment

- [x] Allow or deny sign-ups via an environment variable
- [x] Write all unit tests
- [x] Clean up Dockerfiles for simple deployment
- [x] Create a simple docker-compose for deployment and document it
- [x] Inject environment variables into apps either via .env file for local dev or Docker environment variables for production
- [x] Implement RGAA accessibility compliance
- [x] Package the app for open-source release

## v2.2 — I18n (✅ completed)
- [x] Add internationalization. French / English for now
  - [x] i18n infrastructure (react-i18next + i18next + LanguageDetector)
  - [x] FR and EN translation files (~350+ keys)
  - [x] Language selector in header (FR/EN flag)
  - [x] Dynamic Ant Design locale (frFR / enUS)
  - [x] Dynamic dayjs locale
  - [x] Dynamic `<html lang>`
  - [x] All pages i18n: Login, Dashboard, MailManager, Jobs, Archive, Rules, Settings, Admin, Unsubscribe, Attachments, Insights, Duplicates
  - [x] All components i18n: AppLayout, BulkActionBar, NotificationBell, MailViewer, GmailSearchInput, RuleFormModal, JobProgressModal
  - [x] Language persistence (localStorage)

## v2.3 — Evolution

- [x] Auto-register Gmail account when signing in with Google
- [x] Add a button to force archiving

### Privacy & Security

- [x] **Tracking pixel detector** — Scan emails to detect tracking pixels (1x1 images, UTM parameters, known domains like Mailchimp/SendGrid). "Tracked" badge in the list, monthly report
- [x] **PII scanner in archives** — Detect sensitive data in archived emails (credit card numbers, IBANs, plaintext passwords, social security numbers). Alert and suggest encryption or deletion
- [x] **Archive encryption at rest** — Encrypt EMLs on NAS with a key derived from the user password (AES-256-GCM). On-the-fly decryption for viewing

### Advanced Intelligence & Analytics

- [x] **Email activity heatmap** — Visualize when you receive the most emails (day × hour grid, GitHub contributions style). Identify quiet time slots
- [x] **Sender clutter score** — Combined score of volume, size, read rate, and `List-Unsubscribe` presence. Ranking of "noisy" senders with cleanup suggestions
- [x] **Smart cleanup suggestions** — Heuristics based on sender + subject pattern + unread + old. E.g.: "You have 847 unread GitHub notifications (1.2 GB). Delete?"
- [x] **Inbox Zero tracker** — Real-time counter + progression history towards inbox zero. Streak, progress chart, light gamification

### Advanced Management

- [x] **Saved searches / smart folders** — Save complex Gmail queries as reusable "views". E.g.: "This month's invoices", "Emails with attachments > 5MB not archived"
- [x] **Unified inbox view** — Display emails from all Gmail accounts in a single timeline, with per-account filter
- [x] **Thread reconstruction in archives** — Group archived emails by conversation (via `In-Reply-To` / `References` headers) instead of a flat list. Let the user choose between list or conversation view

### Ops & Resilience

- [x] **Remote storage (S3/MinIO)** — Alternative to local NAS: archive to an S3-compatible bucket. Enables geo-replication of archives
- [x] **Retention policies** — Automatically delete archives older than X months/years. Configurable per account or per label
- [x] **Gmail API quota dashboard** — Visualize Gmail API quota consumption in real time (250 units/user/sec). History and alerts when nearing the limit
- [x] **IMAP import** — Import emails from other providers (Outlook, ProtonMail export) into the archive system
- [x] **Mbox import** — Import an mbox file (Google Takeout, Thunderbird, Apple Mail) → parse and convert into individual EMLs in archives. Upload via UI with progress bar
- [x] Mbox archive export

### Original ideas

- [x] **Email "expiration"** — Mark emails as temporary (OTP codes, delivery confirmations, promos). Auto-deletion after N days. Heuristic detection possible
- [x] **Temporary archive sharing** — Generate a temporary link (token + expiration) to share an archived email with someone without an account

### Open-core / dual offering
- [ ] **SaaS + free self-hosted model** — Create a business model with free self-hosted + SaaS via Stripe + Vercel

### Authentication
- [x] Multi-provider authentication via Arctic (OAuth2). Supported providers: Google, Microsoft, Discord, Facebook (Meta), LinkedIn, Keycloak. Enabled by simply configuring `CLIENT_ID`/`CLIENT_SECRET`. No additional container required

### UI / UX
- [x] Add categories to the sidebar menu (Email, Tools, Analysis, System). Better UX with visual groups in the sidebar

### Other
- [x] Deduplicate attachments by content hash
- [x] MCP server to interact with the app?

## v2.4 — Quality, industrialization & polish (✅ completed)

### Code quality

- [x] **Bug and lint fixes** — Full audit of all files, removal of deprecated function calls, ESLint fixes
- [x] **npm security audit** — `npm audit` run on frontend and backend, identified vulnerabilities fixed
- [x] **Structured logging** — Pino logs added in all backend modules (40+ instrumented modules) and frontend logger for easier bug diagnosis. See [Logging](../technical/logging.md)

### UI / UX

- [x] **Lucide React icons** — Replaced all icons (emojis, Ant Design icons) with [Lucide React](https://lucide.dev/) for a professional and consistent look. Dark mode compatible. Icons also used in i18n keys
- [x] **PWA & mobile navigation** — Installable application (manifest + service worker), responsive approach with sidebar as drawer on mobile, Ant Design breakpoints. See [Frontend — PWA](../technical/frontend.md#pwa-progressive-web-app)
- [x] **Attachment fixes** — Attachments are now viewable and downloadable from the Attachments page (Archives and Gmail tabs)
- [x] **Ops & Resilience fixes** — Ops & Resilience page fully functional (S3 storage, retention, API quota, import/export)

### MCP Tools

- [x] **Extended MCP tools** — Added notification creation (`create-notification`), rules (`create-rule`, `update-rule`, `delete-rule`, `run-rule`), and saved searches (`create-saved-search`, `update-saved-search`, `delete-saved-search`) to the MCP server. See [MCP Server](../guide/mcp-server.md)

### Ops & Deployment

- [x] **Versioning** — Version number (`0.1.0`) in the `VERSION` file at root. Used as `ARG` in the multi-stage Dockerfile and as Docker tag on publish (`latest` + `0.1.0`). See [Versioning](../installation/production.md#versioning)
- [x] **Dockerfile security** — Dockerfiles revamped following best practices: Alpine images, multi-stage build, non-root user (UID 1001), build tools removed, `.dockerignore`, `--ignore-scripts`. See [Container security](../technical/security.md#container-security)
