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

## v2.2 — I18n (✅ complété)
- [x] Ajouter l'internationalisation. Faire français / anglais pour le moment
  - [x] Infrastructure i18n (react-i18next + i18next + LanguageDetector)
  - [x] Fichiers de traduction FR et EN (~350+ clés)
  - [x] Sélecteur de langue dans le header (drapeau FR/EN)
  - [x] Ant Design locale dynamique (frFR / enUS)
  - [x] dayjs locale dynamique
  - [x] `<html lang>` dynamique
  - [x] Toutes les pages i18n : Login, Dashboard, MailManager, Jobs, Archive, Rules, Settings, Admin, Unsubscribe, Attachments, Insights, Duplicates
  - [x] Tous les composants i18n : AppLayout, BulkActionBar, NotificationBell, MailViewer, GmailSearchInput, RuleFormModal, JobProgressModal
  - [x] Persistance de la langue (localStorage)

## v2.3 — Evolution

- [x] Si on se connecte avec son compte Google, on enregistre automatiquement son compte Gmail
- [x] Ajouter un bouton pour forcer l'archivage

### Vie privée & Sécurité

- [x] **Détecteur de pixels-espions** — Scanner les emails pour détecter les tracking pixels (images 1x1, paramètres UTM, domaines connus type Mailchimp/SendGrid). Badge "tracké" dans la liste, rapport mensuel
- [x] **Scanner PII dans les archives** — Détecter les données sensibles dans les mails archivés (numéros de CB, IBAN, mots de passe en clair, numéros de sécu). Alerter et proposer le chiffrement ou la suppression
- [x] **Chiffrement des archives au repos** — Chiffrer les EML sur le NAS avec une clé dérivée du mot de passe utilisateur (AES-256-GCM). Déchiffrement à la volée pour la consultation

### Intelligence & Analytics avancées

- [x] **Heatmap d'activité email** — Visualiser quand vous recevez le plus de mails (grille jour × heure, style contributions GitHub). Identifier les créneaux calmes
- [x] **Score d'encombrement par expéditeur** — Score combinant volume, taille, taux de lecture, et présence de `List-Unsubscribe`. Classement des expéditeurs "pollueurs" avec suggestion de nettoyage
- [x] **Suggestions de nettoyage intelligent** — Heuristiques basées sur expéditeur + pattern sujet + non lu + ancien. Ex : "Vous avez 847 notifications GitHub non lues (1.2 Go). Supprimer ?"
- [x] **Tracker Inbox Zero** — Compteur temps réel + historique de la progression vers inbox zero. Streak, graphique d'évolution, gamification légère

### Gestion avancée

- [x] **Recherches sauvegardées / dossiers intelligents** — Sauvegarder des requêtes Gmail complexes comme "vues" réutilisables. Ex : "Factures de ce mois", "Mails avec PJ > 5Mo non archivés"
- [x] **Vue boîte unifiée** — Afficher les mails de tous les comptes Gmail dans une seule timeline, avec filtre par compte
- [x] **Reconstruction de threads dans les archives** — Regrouper les mails archivés par conversation (via `In-Reply-To` / `References` headers) au lieu d'une liste plate. Laisser le choix à l'utilisateur s'il veux liste ou conversations

### Ops & Résilience

- [x] **Stockage distant (S3/MinIO)** — Alternative au NAS local : archiver vers un bucket S3-compatible. Permet de géo-répliquer les archives
- [x] **Politiques de rétention** — Supprimer automatiquement les archives de plus de X mois/années. Configurable par compte ou par label
- [x] **Dashboard quota Gmail API** — Visualiser la consommation du quota Gmail API en temps réel (250 unités/user/sec). Historique et alertes si proche du plafond
- [x] **Import IMAP** — Importer des mails depuis d'autres providers (Outlook, ProtonMail export) dans le système d'archives
- [x] **Import mbox** — Importer un fichier mbox (Google Takeout, Thunderbird, Apple Mail) → parser et convertir en EML individuels dans les archives. Upload via l'UI avec barre de progression
- [x] Export archive au format mbox

### Idées originales

- [x] **Email "expiration"** — Marquer des emails comme temporaires (codes OTP, confirmations de livraison, promos). Auto-suppression après N jours. Détection heuristique possible
- [x] **Partage d'archive temporaire** — Générer un lien temporaire (token + expiration) pour partager un mail archivé avec quelqu'un sans compte

### open-core / dual offering
- [ ] **application modèle saas + self hosted gratuit** création d'un business model du genre self hosted gratuit + saas via stripe + vercel

### authentification
- [x] Ajout de l'authentification multi-provider via Arctic (OAuth2). Providers supportés : Google, Microsoft, Discord, Facebook (Meta), LinkedIn, Keycloak. Activation par simple configuration des `CLIENT_ID`/`CLIENT_SECRET`. Sans conteneur supplémentaire

### ui / ux
- [x] mettre des catégories sur le menu latérale (Email, Outils, Analyse, Système). Meilleure UX avec groupes visuels dans le sidebar


### autre
- [x] dédupliquer les pièces jointes par hash de contenu
- [x] serveur mcp pour manipuler l'appli ?