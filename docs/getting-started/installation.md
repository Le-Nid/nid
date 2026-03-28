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
3. Ajouter l'URI de redirection autorisée :
   ```
   http://localhost:4000/api/auth/gmail/callback
   ```
   (Remplacez `localhost` par votre domaine si vous exposez l'app)
4. Notez le **Client ID** et le **Client Secret**

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

```bash
# Production
docker compose up -d

# Développement (avec hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Vérifiez que tous les conteneurs sont up :

```bash
docker compose ps
```

| Service | Port | Description |
|---|---|---|
| frontend | 3000 | Interface web React |
| backend | 4000 | API Fastify |
| postgres | — | Base de données |
| redis | — | Queue BullMQ |

---

## 6. Vérifier l'installation

```bash
# Health check de l'API
curl http://localhost:4000/health
# → {"status":"ok","timestamp":"..."}

# Documentation API Swagger
open http://localhost:4000/docs
```
