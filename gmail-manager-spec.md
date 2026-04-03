# Nid — Spécification du projet

## Contexte

Application self-hosted (Docker) de gestion et d'archivage de boîtes Gmail.
Remplace des outils comme Gmail Cleaner et OpenArchiver.
Déployée sur NAS personnel avec stack Docker complète.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 19 + Ant Design |
| Backend | Fastify + TypeScript |
| Auth locale | JWT (login/register) |
| Auth Gmail | OAuth2 Gmail API |
| Base de données | PostgreSQL |
| Queue / Jobs | BullMQ + Redis |
| Stockage archives | Volumes Docker → NAS |
| Format archives | EML (1 fichier par mail) + index PostgreSQL |

---

## Architecture générale

```
┌─────────────────────────────────┐
│  React 19 + Ant Design          │
│  - Auth locale JWT              │
│  - Dashboard analytique         │
│  - Gestion mails live           │
│  - Archives                     │
└────────────┬────────────────────┘
             │ HTTP + JWT
┌────────────▼────────────────────┐
│  Fastify + TypeScript (API)     │
│  - Auth JWT local               │
│  - OAuth2 Gmail multi-compte    │
│  - Gmail API wrapper            │
│  - Batch / Bulk operations      │
│  - Export EML + PJ              │
│  - Job tracker BullMQ           │
└──────┬─────────────┬────────────┘
       │             │
┌──────▼───┐   ┌─────▼──────────┐
│ Gmail API│   │   PostgreSQL   │
│ (OAuth2) │   │ + Redis/BullMQ │
└──────────┘   └────────────────┘
                     │
              ┌──────▼──────────┐
              │  NAS /archives  │
              │  EML + PJ       │
              └─────────────────┘
```

---

## Structure du projet

```
nid/
  docker-compose.yml
  backend/
    src/
      auth/           ← JWT local + OAuth2 Gmail
      gmail/          ← Gmail API wrapper
      archive/        ← Logique archivage EML
      jobs/           ← BullMQ workers
      routes/         ← API Fastify
    Dockerfile
  frontend/
    src/
      pages/
        Login.tsx
        Dashboard.tsx
        MailManager.tsx
        Archive.tsx
      components/
    Dockerfile
  postgres/
    init.sql
  redis/
  volumes/
    archives/         ← Monté sur NAS
```

---

## Modules fonctionnels

### 🔐 Auth

- Login / Register local avec JWT
- Sessions JWT (access token + refresh token)
- Connexion multi-comptes Gmail via OAuth2
- Scopes OAuth Gmail requis :
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/gmail.labels`
- Gestion des tokens OAuth par compte (stockage sécurisé en base)
- Révocation de compte Gmail

---

### 📊 Dashboard

Données calculées via Gmail API + index PostgreSQL.

**Graphiques :**
- Top N expéditeurs par nombre de mails (bar chart)
- Top N expéditeurs par taille totale (bar chart)
- Liste des mails les plus gros (tableau)
- Évolution du volume de mails dans le temps (timeline / line chart)
- Répartition mails lus / non lus (donut)
- Répartition par labels Gmail (donut ou bar)
- Taille totale de la boîte consommée

Sélecteur de compte Gmail actif (multi-compte).

---

### 📬 Gestion des mails (live Gmail)

Toutes les opérations se font **directement sur Gmail via l'API** (pas de copie locale).

**Liste et filtres :**
- Liste paginée des mails
- Filtres : expéditeur, date, taille, label, lu/non lu
- Recherche Gmail (requêtes natives Gmail : `from:`, `has:attachment`, `larger:`, etc.)

**Lecture :**
- Affichage du mail (HTML + texte)
- Liste des pièces jointes avec preview et download

**Bulk operations (sélection multiple) :**
- Supprimer (trash)
- Supprimer définitivement
- Ajouter / retirer un label
- Déplacer vers un label
- Marquer lu / non lu
- Archiver (retirer de l'inbox)

**Gestion des labels :**
- Lister, créer, modifier, supprimer des labels Gmail

**Règles automatiques :**
- Définir des règles : si expéditeur = X → action (label, trash, archive)
- Exécution manuelle ou planifiée (cron)
- Stockage des règles en PostgreSQL

---

### 📦 Archives (local NAS)

#### Format de stockage

**EML + index PostgreSQL** (choix retenu vs mbox).

Raisons du choix vs mbox :
- 1 fichier `.eml` par mail → différentiel simple par comparaison d'IDs
- Pas de parsing de fichier entier pour lire un mail
- Résistant à la corruption (1 mail corrompu n'impacte pas les autres)
- PJ extractables proprement à côté
- Recherche full-text via index PostgreSQL

**Structure sur le NAS :**
```
/archives
  /{account_id}/
    /{year}/
      /{month}/
        /{gmail_message_id}.eml
        /{gmail_message_id}_attachments/
          fichier.pdf
          image.png
    /index.json     ← IDs archivés (diff rapide)
```

#### Archivage

- Archivage manuel : sélection de mails → export local
- Archivage automatique : cron + règles (ex : archiver tout ce qui a > 6 mois)
- Différentiel : comparaison ID Gmail ↔ index → on n'archive pas deux fois le même mail
- Déduplication basée sur l'ID Gmail

#### Consultation des archives

- Liste des mails archivés (filtres : expéditeur, date, taille, label d'origine)
- Lecture d'un mail archivé (rendu HTML depuis EML)
- Preview et download des pièces jointes archivées
- Recherche full-text (sujet, expéditeur, corps) via PostgreSQL `tsvector`

#### Export

- Export ZIP d'une sélection de mails archivés (EML + PJ)

---

### ⚙️ Job Tracker (BullMQ)

Indispensable pour les opérations longues sur 5000+ mails.

**Jobs gérés :**
- Bulk delete / label / move
- Archivage (fetch Gmail → écriture EML)
- Exécution des règles automatiques
- Synchronisation index dashboard

**Contraintes Gmail API :**
- `messages.list` retourne uniquement des IDs → 2 niveaux de requêtes
- Batch API : max 100 requêtes par batch
- Quota : 250 unités/user/seconde → throttling obligatoire
- Pour la suppression : `messages.trash` (corbeille) par défaut, `messages.delete` pour suppression définitive

**Interface job tracker (frontend) :**
- Liste des jobs en cours / terminés / en erreur
- Barre de progression
- Annulation d'un job

---

## Schéma base de données (PostgreSQL)

```sql
-- Utilisateurs locaux
users (id, email, password_hash, created_at)

-- Comptes Gmail liés à un utilisateur
gmail_accounts (
  id, user_id, email,
  access_token, refresh_token, token_expiry,
  created_at
)

-- Index des mails archivés
archived_mails (
  id, gmail_account_id, gmail_message_id,
  subject, sender, recipient,
  date, size_bytes,
  has_attachments, label_ids,
  eml_path, archived_at,
  search_vector tsvector   ← full-text search
)

-- Pièces jointes archivées
archived_attachments (
  id, archived_mail_id,
  filename, mime_type, size_bytes, file_path
)

-- Règles automatiques
rules (
  id, gmail_account_id,
  name, conditions (jsonb), action (jsonb),
  is_active, schedule (cron string),
  created_at
)

-- Jobs BullMQ (trace)
jobs (
  id, type, status, progress,
  gmail_account_id, payload (jsonb),
  created_at, completed_at, error
)
```

---

## docker-compose (structure cible)

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]

  backend:
    build: ./backend
    ports: ["4000:4000"]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ...
      GOOGLE_CLIENT_ID: ...
      GOOGLE_CLIENT_SECRET: ...
    volumes:
      - ./volumes/archives:/archives

  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

---

## Ordre de développement recommandé

1. **Structure du projet** — monorepo, docker-compose, Dockerfiles
2. **Backend Auth** — JWT local (register/login) + middleware
3. **Backend OAuth2 Gmail** — connexion compte, stockage token, multi-compte
4. **Backend Gmail API** — wrapper : list, get, batch ops, labels
5. **Backend Archive** — fetch → EML → NAS + index PostgreSQL
6. **Backend BullMQ** — workers pour bulk ops et archivage
7. **Frontend Auth** — login/register simple
8. **Frontend Dashboard** — charts Ant Design / Recharts
9. **Frontend Gestion mails** — liste, filtres, bulk, lecture, PJ
10. **Frontend Archives** — liste, lecture, recherche, download
11. **Frontend Job tracker** — progression, erreurs

---

## Points d'attention / décisions prises

| Sujet | Décision |
|---|---|
| Format archive | EML + index PostgreSQL (pas mbox) |
| Suppression Gmail | `trash` par défaut, `delete` en option explicite |
| Bulk ops | Via BullMQ, pas en synchrone HTTP |
| Multi-compte | Oui, dès le début |
| Règles auto | Oui, conditions JSONB + cron |
| Auth locale | JWT uniquement (pas Keycloak pour ce projet) |
| Recherche archives | PostgreSQL full-text (`tsvector`) |
| Quota Gmail API | Throttling côté backend obligatoire (250 unités/s) |
