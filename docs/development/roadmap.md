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

## v2.0 — Multi-utilisateurs (✅ complété)

- [x] Isolation stricte des données par utilisateur (`requireAccountOwnership` middleware)
- [x] Gestion des rôles (admin / user) — `role` dans JWT, middleware `requireAdmin`
- [x] Page admin : vue globale des comptes, jobs, statistiques, modification utilisateurs
- [x] Quota et limites par utilisateur (`max_gmail_accounts`, `storage_quota_bytes`)
- [x] Authentification / inscription via Google SSO (OAuth2 `openid profile email`)
- [x] Migration DB `003_multiuser` — colonnes `role`, `google_id`, `is_active`, quotas, `user_id` sur jobs
- [x] Profil utilisateur dans les paramètres (avatar, quota, stockage)
- [x] Sécurisation de toutes les routes avec vérification d'ownership des comptes Gmail

## v2.1 — Nettoyage, insights & robustesse

### Haute valeur ajoutée

- [x] **Unsubscribe Manager** — Scanner les headers `List-Unsubscribe`, page dédiée listant newsletters/listes avec volume et taille, désabonnement en un clic + suppression en masse
- [x] **Archivage automatique planifié** — Rule action `archive_nas` planifiable (ex : archiver tout > 6 mois, chaque dimanche). Conditions `older_than` / `newer_than` ajoutées aux règles
- [x] **Gestionnaire de pièces jointes** — Page dédiée listant toutes les PJ (live Gmail + archives) triées par taille, avec recherche et tri
- [x] **Rapport hebdo / insights** — Page Insights avec rapport hebdomadaire + système de notifications in-app (cloche dans le header, scheduler lundi)

### Qualité de vie

- [x] **Templates de règles** — Bibliothèque de règles pré-configurées (ex : "Nettoyer notifs GitHub", "Archiver factures > 3 mois", "Supprimer newsletters non lues > 30j"). Un clic pour activer
- [x] **Détection de doublons** — Identifier les mails en double (même subject + sender + date), proposer suppression groupée
- [x] **Audit log** — Table `audit_logs(user_id, action, target, details, created_at)` traçant les actions sensibles (suppression, archivage, modification de règles)
- [x] **2FA / TOTP** — Authentification à deux facteurs pour comptes locaux (via `otplib`). Pertinent pour app self-hosted avec accès aux boîtes Gmail

### Nice to have

- [x] **Vérification d'intégrité des archives** — Job planifié comparant EMLs archivés ↔ index PostgreSQL, détection fichiers manquants ou corrompus
- [x] **Webhooks / notifications externes** — Webhook configurable (Discord, Slack, Ntfy) sur événements : job échoué, règle exécutée, quota atteint. Dispatcher unifié `notify()` reliant in-app + toast + webhooks
- [x] **Raccourcis clavier** — Dans MailManager : `j/k` (navigation), `e` (archiver), `#` (supprimer), `/` (recherche)
- [x] **Export/import de configuration** — Exporter règles + paramètres en JSON, réimporter sur une autre instance
- [x] **Préférences de notifications** — Tableau 3 canaux (🔔 in-app, 💬 toast, 🔗 webhook) par type d'événement, sauvegarde instantanée

### Ops & déploiement

- [x] Via une variable d'environnement, choisir d'accepter ou non les inscriptions
- [x] Faire tous les tests unitaires
- [x] Mettre au propre les dockerfiles pour un déploiement simple
- [x] Faire un docker-compose simple pour le déploiement et en faire la doc
- [x] Faire en sorte que les variables d'environnements soient injectées dans les applis soit par fichier .env pour le dev local soit par variable d'environnement docker pour la prod
- [x] Implémenter le RGAA
- [x] Il faut packagé l'appli pour la mettre en open source ensuite

