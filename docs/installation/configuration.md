# Configuration détaillée

Toutes les variables d'environnement de Gmail Manager, définies dans le fichier `.env` à la racine du projet.

---

## Application

| Variable | Défaut | Description |
|---|---|---|
| `FRONTEND_URL` | `http://localhost:3000` | URL publique de l'application. Utilisée pour les redirections OAuth2 et la génération des URIs de callback |
| `APP_PORT` | `3000` | Port exposé de l'application (production unifiée) |
| `ARCHIVE_PATH` | `/archives` | Chemin interne Docker de stockage des archives EML |
| `NODE_ENV` | `development` | Environnement d'exécution (`development` / `production`) |
| `LOG_LEVEL` | `info` | Niveau de log (`debug`, `info`, `warn`, `error`) |

---

## JWT (authentification)

| Variable | Défaut | Description |
|---|---|---|
| `JWT_SECRET` | — | **Requis.** Secret de signature des access tokens. Générez avec `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | — | **Requis.** Secret de signature des refresh tokens |
| `JWT_EXPIRY` | `15m` | Durée de validité de l'access token |
| `JWT_REFRESH_EXPIRY` | `30d` | Durée de validité du refresh token |

!!! warning "Sécurité"
    Utilisez des secrets aléatoires longs (au moins 64 caractères hexadécimaux). Ne réutilisez jamais le même secret pour les access et refresh tokens.

---

## Google OAuth2

| Variable | Défaut | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | **Requis.** Client ID de votre projet Google Cloud |
| `GOOGLE_CLIENT_SECRET` | — | **Requis.** Client Secret de votre projet Google Cloud |
| `GOOGLE_REDIRECT_URI` | *(dérivé de FRONTEND_URL)* | URI de callback pour la connexion des comptes Gmail |
| `GOOGLE_SSO_REDIRECT_URI` | *(dérivé de FRONTEND_URL)* | URI de callback pour la connexion Google SSO |

!!! info "Dérivation automatique en Docker prod"
    En production, `docker-compose.yml` dérive automatiquement les URIs de callback à partir de `FRONTEND_URL` (ex. `${FRONTEND_URL}/api/auth/gmail/callback`). Il suffit de définir `FRONTEND_URL`.

    En développement local (hors Docker), définissez explicitement `GOOGLE_REDIRECT_URI` et `GOOGLE_SSO_REDIRECT_URI` pointant vers le port du backend (4000).

---

## Social Login (SSO)

En plus de Google SSO, vous pouvez activer d'autres fournisseurs d'authentification. Chaque provider est **activé automatiquement** dès que ses variables `CLIENT_ID` et `CLIENT_SECRET` sont définies.

### Microsoft

| Variable | Description |
|---|---|
| `MICROSOFT_CLIENT_ID` | Client ID de votre app Microsoft Entra. [Créer sur portal.azure.com](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps) |
| `MICROSOFT_CLIENT_SECRET` | Client Secret de votre app Microsoft Entra |

### Discord

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID de votre app Discord. [Créer sur discord.com/developers](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_SECRET` | Client Secret de votre app Discord |

### Facebook

| Variable | Description |
|---|---|
| `FACEBOOK_CLIENT_ID` | App ID Meta. [Créer sur developers.facebook.com](https://developers.facebook.com/apps) |
| `FACEBOOK_CLIENT_SECRET` | App Secret Meta |

### LinkedIn

| Variable | Description |
|---|---|
| `LINKEDIN_CLIENT_ID` | Client ID LinkedIn. [Créer sur linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| `LINKEDIN_CLIENT_SECRET` | Client Secret LinkedIn |

### Keycloak

| Variable | Description |
|---|---|
| `KEYCLOAK_REALM_URL` | URL du realm Keycloak (ex. `https://auth.example.com/realms/myrealm`) |
| `KEYCLOAK_CLIENT_ID` | Client ID du client Keycloak |
| `KEYCLOAK_CLIENT_SECRET` | Client Secret du client Keycloak |

!!! tip "URI de callback"
    Pour chaque provider, l'URI de callback à enregistrer dans la console du fournisseur est :
    ```
    {FRONTEND_URL}/api/auth/social/{provider}/callback
    ```
    Exemple : `http://localhost:3000/api/auth/social/microsoft/callback`

---

## Multi-utilisateurs

| Variable | Défaut | Description |
|---|---|---|
| `ADMIN_EMAIL` | *(vide)* | L'utilisateur qui s'inscrit avec cet email obtient automatiquement le rôle `admin` |
| `ALLOW_REGISTRATION` | `true` | `false` pour fermer les inscriptions (formulaire et SSO). Les tentatives retourneront une erreur 403 |

---

## PostgreSQL

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Utilisateur de la base de données |
| `POSTGRES_PASSWORD` | Mot de passe de la base de données |
| `POSTGRES_DB` | Nom de la base de données |
| `DATABASE_URL` | *(dérivé automatiquement en Docker)* URL de connexion complète |

---

## Redis

| Variable | Défaut | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | URL de connexion Redis |
| `REDIS_PASSWORD` | *(vide)* | Mot de passe Redis (recommandé en production) |

---

## Throttling Gmail API

Gmail API impose des quotas (250 unités/user/seconde). Ces variables permettent de contrôler le débit :

| Variable | Défaut | Description |
|---|---|---|
| `GMAIL_BATCH_SIZE` | `25` | Nombre de requêtes parallèles par batch |
| `GMAIL_THROTTLE_MS` | `1000` | Pause en millisecondes entre chaque batch |
| `GMAIL_CONCURRENCY` | `10` | Nombre max de requêtes concurrentes vers Gmail API |

!!! info "Ajustement"
    Avec plusieurs utilisateurs actifs simultanément, augmentez `GMAIL_THROTTLE_MS` ou diminuez `GMAIL_BATCH_SIZE` pour éviter les erreurs 429 (rate limit).

---

## Stockage distant (S3/MinIO)

En plus du stockage local, Gmail Manager peut archiver vers un bucket S3-compatible. Ces variables définissent la configuration **globale** (tous les utilisateurs). Chaque utilisateur peut aussi configurer son propre stockage S3 via l'interface.

| Variable | Défaut | Description |
|---|---|---|
| `S3_ENDPOINT` | *(vide)* | URL du serveur S3 (ex. `https://s3.amazonaws.com` ou `https://minio.local:9000`). Si vide, le stockage S3 global est désactivé |
| `S3_REGION` | `us-east-1` | Région du bucket S3 |
| `S3_BUCKET` | `gmail-manager-archives` | Nom du bucket de stockage |
| `S3_ACCESS_KEY_ID` | *(vide)* | Access Key ID pour l'authentification S3 |
| `S3_SECRET_ACCESS_KEY` | *(vide)* | Secret Access Key pour l'authentification S3 |
| `S3_FORCE_PATH_STYLE` | `true` | Utiliser le path-style pour les requêtes S3. Requis pour MinIO, désactiver pour AWS S3 |

!!! tip "MinIO en Docker"
    Pour utiliser MinIO auto-hébergé, ajoutez un service `minio` à votre `docker-compose.yml` :

    ```yaml
    minio:
      image: minio/minio
      command: server /data --console-address ":9001"
      environment:
        MINIO_ROOT_USER: minioadmin
        MINIO_ROOT_PASSWORD: minioadmin
      volumes:
        - minio_data:/data
      ports:
        - "9000:9000"
        - "9001:9001"
    ```

    Puis configurez :
    ```bash
    S3_ENDPOINT=http://minio:9000
    S3_ACCESS_KEY_ID=minioadmin
    S3_SECRET_ACCESS_KEY=minioadmin
    S3_BUCKET=gmail-manager-archives
    S3_FORCE_PATH_STYLE=true
    ```

---

## Volumes Docker

### Configuration par défaut

```yaml
volumes:
  - ./volumes/archives:/archives    # Archives EML
  - postgres_data:/var/lib/postgresql/data
  - redis_data:/data
```

### Pointer vers un NAS

=== "Synology"

    ```yaml
    volumes:
      - /volume1/gmail-archives:/archives
    ```

=== "TrueNAS"

    ```yaml
    volumes:
      - /mnt/pool/gmail-archives:/archives
    ```

=== "Chemin personnalisé"

    ```yaml
    volumes:
      - /chemin/vers/vos/archives:/archives
    ```

---

## Documentation API (Swagger)

La documentation Swagger est disponible en développement à :

```
http://localhost:4000/docs
```

En production (image unifiée) :

```
http://localhost:3000/api/docs
```

Elle est générée automatiquement par `@fastify/swagger` et liste tous les endpoints avec leurs schémas.
