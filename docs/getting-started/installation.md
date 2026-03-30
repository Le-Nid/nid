# Installation

## Prérequis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
- **Un compte Google Cloud** pour créer les credentials OAuth2
- Un NAS ou serveur avec au moins 1 Go de RAM disponible

---

## 1. Cloner le dépôt

```bash
git clone https://github.com/befa160/gmail-manager.git
cd gmail-manager
```

---

## 2. Configurer les credentials Google

Avant de lancer l'application, vous devez créer un projet Google Cloud et des credentials OAuth2.

### Créer un projet Google Cloud

1. Rendez-vous sur [console.cloud.google.com](https://console.cloud.google.com)
2. Créez un nouveau projet (ex. : `gmail-manager`)
3. Activez l'**API Gmail** : APIs & Services → Bibliothèque → rechercher "Gmail API" → Activer

### Créer les credentials OAuth2

1. APIs & Services → Identifiants → **Créer des identifiants** → ID client OAuth 2.0
2. Type d'application : **Application Web**
3. Ajouter **deux** URIs de redirection autorisées :
   ```
   http://localhost:4000/api/auth/gmail/callback
   http://localhost:4000/api/auth/google/callback
   ```
   La première sert à connecter les comptes Gmail, la seconde à la connexion Google SSO.
   (Remplacez `localhost` par votre domaine si vous exposez l'app)
4. Notez le **Client ID** et le **Client Secret**

!!! tip "Deux URIs de redirection"
    Les deux callbacks sont nécessaires : `/gmail/callback` gère la liaison d'un compte Gmail à l'app, `/google/callback` gère l'authentification/inscription via Google SSO. Si vous oubliez la seconde, le bouton « Se connecter avec Google » retournera une erreur `invalid_client`.

### Configurer l'écran de consentement

1. APIs & Services → Écran de consentement OAuth
2. Type : **Interne** (si Google Workspace) ou **Externe**
3. Ajoutez votre email en tant qu'utilisateur de test si externe

---

## 3. Configurer l'environnement

```bash
cp .env.example .env
```

Éditez `.env` :

```bash
# Secrets JWT — générez des valeurs aléatoires
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# Credentials Google
GOOGLE_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-votre_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/gmail/callback
GOOGLE_SSO_REDIRECT_URI=http://localhost:4000/api/auth/google/callback

# Premier utilisateur avec cet email → rôle admin automatique
ADMIN_EMAIL=votre@email.com

# Base de données
POSTGRES_USER=gmailmanager
POSTGRES_PASSWORD=mot_de_passe_fort
POSTGRES_DB=gmailmanager
```

!!! warning "Sécurité"
    Ne commitez jamais votre fichier `.env`. Il est dans `.gitignore` par défaut.

---

## 4. Configurer le volume NAS

Le dossier `./volumes/archives` est monté comme volume Docker vers `/archives` dans le conteneur backend.

Pour pointer vers votre NAS, modifiez `docker-compose.yml` :

```yaml
volumes:
  - /mnt/nas/gmail-archives:/archives   # ← chemin sur votre NAS
```

---

## 5. Lancer l'application

### Production

```bash
docker compose up -d
```

!!! info "Sécurité réseau"
    En production, PostgreSQL et Redis ne sont **pas** exposés sur l'hôte. Seuls le frontend (port 3000) et le backend (port 4000) sont accessibles.

### Développement (avec hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

En mode dev, les ports PostgreSQL (5432) et Redis (6379) sont exposés pour vos outils locaux (DBeaver, redis-cli, etc).

Vérifiez que tous les conteneurs sont up :

```bash
docker compose ps
```

| Service | Port prod | Port dev | Description |
|---|---|---|---|
| frontend | 3000 | 3000 | Interface web React |
| backend | 4000 | 4000 + 9229 (debug) | API Fastify |
| postgres | — | 5432 | Base de données |
| redis | — | 6379 | Queue BullMQ |

---

## 6. Vérifier l'installation

```bash
# Health check de l'API
curl http://localhost:4000/api/auth/config
# → {"allowRegistration":true,"googleSsoEnabled":true}

# Documentation API Swagger
open http://localhost:4000/docs
```

Docker inclut des healthchecks automatiques pour tous les services :

```bash
docker compose ps
# Tous les services doivent afficher "healthy"
```

---

## 7. Fermer les inscriptions

Une fois vos utilisateurs créés, fermez les inscriptions :

```bash
# Dans .env
ALLOW_REGISTRATION=false
```

```bash
docker compose up -d  # Relance uniquement le backend
```

Les tentatives d'inscription (formulaire ou Google SSO) retourneront une erreur 403.
