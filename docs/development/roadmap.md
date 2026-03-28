# Roadmap

## v1.0 — MVP (en cours)

- [x] Auth locale JWT
- [x] OAuth2 Gmail multi-compte
- [x] Structure Docker complète
- [x] Schéma PostgreSQL
- [x] BullMQ queue + workers bulk + archive
- [x] Archive EML différentielle
- [x] API REST complète (auth, gmail, archive, dashboard, jobs)
- [x] Layout frontend + auth UI
- [ ] Dashboard avec graphiques (Recharts / Ant Design Charts)
- [ ] Page gestion des mails (liste, filtres, bulk ops)
- [ ] Page archives (liste, recherche, lecture EML)
- [ ] Page jobs (suivi progression)
- [ ] Page paramètres (connexion comptes Gmail)

## v1.1 — Règles automatiques

- [ ] UI de création de règles (conditions + action)
- [ ] Worker `run_rule` BullMQ
- [ ] Planification cron des règles
- [ ] Historique d'exécution des règles

## v1.2 — Archives avancées

- [ ] Export ZIP d'une sélection d'archives
- [ ] Preview HTML des mails archivés (rendu inline)
- [ ] Preview pièces jointes (images, PDF)
- [ ] Archivage automatique par ancienneté (cron configurable)

## v1.3 — UX & performance

- [ ] Recherche Gmail native full-text dans l'UI
- [ ] Pagination infinie dans la liste des mails
- [ ] Notifications temps réel des jobs (WebSocket)
- [ ] Dark mode

## v2.0 — Multi-utilisateurs

- [ ] Isolation stricte des données par utilisateur
- [ ] Gestion des rôles (admin / user)
- [ ] Page admin : vue globale des comptes et jobs
