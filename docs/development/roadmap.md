# Roadmap

## v1.0 — MVP (✅ complété)

- [x] Auth locale JWT
- [x] OAuth2 Gmail multi-compte
- [x] Structure Docker complète
- [x] Schéma PostgreSQL
- [x] BullMQ queue + workers bulk + archive
- [x] Archive EML différentielle
- [x] API REST complète (auth, gmail, archive, dashboard, jobs)
- [x] Layout frontend + auth UI
- [x] Dashboard avec graphiques (Ant Design Charts)
- [x] Page gestion des mails (liste, filtres, bulk ops, lecture)
- [x] Page archives (liste, recherche, lecture EML, PJ)
- [x] Page jobs (suivi progression, annulation)
- [x] Page paramètres (connexion comptes Gmail)

## v1.1 — Règles automatiques (✅ complété)

- [x] Types partagés `RuleCondition` / `RuleAction` (backend + frontend)
- [x] Service `rules.service.ts` — CRUD + conversion conditions → query Gmail native
- [x] Worker `rule.worker.ts` — exécution BullMQ
- [x] Scheduler cron — exécution planifiée (hourly/daily/weekly/monthly)
- [x] Routes API complètes (CRUD + toggle + run + preview)
- [x] UI — page Règles avec table, switch actif/inactif, exécution manuelle
- [x] UI — `RuleFormModal` avec builder de conditions, preview avant création
- [x] Documentation API `rules.md`

## v1.2 — Archives avancées + Performance (✅ complété)

- [x] Export ZIP sélectif des archives (EML + PJ, streaming chunked)
- [x] Preview HTML inline des mails archivés (extraction depuis EML, iframe sandboxée)
- [x] Toggle HTML / EML brut dans le viewer d'archives
- [x] Cache Redis des stats dashboard (10min) et archive-stats (5min) — `?refresh=1` pour forcer
- [x] SSE (Server-Sent Events) pour suivi temps réel des jobs — remplace le polling
- [x] `useJobSSE` hook React + `JobProgressModal` composant
- [x] QueueEvents BullMQ → broadcast SSE automatique (progress, completed, failed)
- [x] Invalidation cache après archivage

## Kysely (✅ complété — rétrofit sur v1.0-v1.2)

- [x] `db/types.ts` — interface `Database` entièrement typée (Generated, Selectable, Insertable)
- [x] `db/migrations/001_initial.ts` — schéma complet (extensions, tables, index, triggers tsvector)
- [x] `db/migrations/002_example_add_column.ts` — template pour futures migrations
- [x] `db/index.ts` — `InCodeMigrationProvider` + `runMigrations()` au démarrage
- [x] `plugins/db.ts` — migrations avant décoration Fastify
- [x] Tous services/routes/workers réécrits avec Kysely query builder
- [x] `postgres/init.sql` supprimé — migrations font foi
- [x] `vite.config.ts` backend — `kysely` externalisé

## v1.3 — UX & Performance (✅ complété)

- [x] **Pagination infinie** dans MailManager (IntersectionObserver, `useInfiniteScroll`)
- [x] **Autocomplete opérateurs Gmail** — `GmailSearchInput` avec 25 opérateurs natifs
- [x] **Dark mode** — `useThemeStore` Zustand persisté localStorage, `ConfigProvider` réactif
- [x] **Notifications globales jobs** — `useGlobalJobNotifier` poll 5s + toast completed/failed
- [x] **Preview images PJ** dans Archive drawer (lazy loading, `mime_type.startsWith('image/')`)
- [x] `AntApp` wrapper pour accès global aux hooks notification/message Ant Design

## v2.0 — Multi-utilisateurs

- [ ] Isolation stricte des données par utilisateur
- [ ] Gestion des rôles (admin / user)
- [ ] Page admin : vue globale des comptes et jobs
- [ ] Quota et limites par utilisateur
