# Configuration

## Variables d'environnement

Toutes les variables sont définies dans `.env` à la racine du projet.

### Application

| Variable | Défaut | Description |
|---|---|---|
| `FRONTEND_PORT` | `3000` | Port exposé du frontend |
| `BACKEND_PORT` | `4000` | Port exposé du backend |
| `FRONTEND_URL` | `http://localhost:3000` | URL publique du frontend (utilisée pour les redirections OAuth2) |
| `ARCHIVE_PATH` | `/archives` | Chemin interne Docker des archives (mappé vers votre NAS) |

### JWT

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret de signature des access tokens. Générez avec `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Secret de signature des refresh tokens |
| `JWT_EXPIRY` | Durée de validité de l'access token (défaut : `15m`) |
| `JWT_REFRESH_EXPIRY` | Durée de validité du refresh token (défaut : `30d`) |

### Google OAuth2

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID de votre application Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client Secret de votre application Google Cloud |
| `GOOGLE_REDIRECT_URI` | URI de callback OAuth2 pour la connexion des comptes Gmail |
| `GOOGLE_SSO_REDIRECT_URI` | *(optionnel)* URI de callback pour le Google SSO. Si absent, utilise `GOOGLE_REDIRECT_URI` |

!!! info "Docker prod : dérivation automatique"
    En Docker prod, `docker-compose.yml` dérive automatiquement `GOOGLE_REDIRECT_URI` et `GOOGLE_SSO_REDIRECT_URI` à partir de `FRONTEND_URL` (ex: `${FRONTEND_URL}/api/auth/google/callback`). Il suffit de définir `FRONTEND_URL` dans le `.env`.

### Social Login (OAuth2 via Arctic)

En plus du Google SSO (ci-dessus), vous pouvez activer d'autres fournisseurs de connexion sociale. Chaque provider est **activé automatiquement** dès que ses variables `CLIENT_ID` et `CLIENT_SECRET` sont définies.

| Variable | Description |
|---|---|
| `MICROSOFT_CLIENT_ID` | Client ID de votre app Microsoft Entra (Azure AD). Créez-la sur [portal.azure.com](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps) |
| `MICROSOFT_CLIENT_SECRET` | Client Secret de votre app Microsoft Entra |
| `DISCORD_CLIENT_ID` | Client ID de votre app Discord. Créez-la sur [discord.com/developers](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_SECRET` | Client Secret de votre app Discord |
| `FACEBOOK_CLIENT_ID` | App ID de votre app Meta (Facebook). Créez-la sur [developers.facebook.com](https://developers.facebook.com/apps) |
| `FACEBOOK_CLIENT_SECRET` | App Secret de votre app Meta |
| `LINKEDIN_CLIENT_ID` | Client ID de votre app LinkedIn. Créez-la sur [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| `LINKEDIN_CLIENT_SECRET` | Client Secret de votre app LinkedIn |
| `KEYCLOAK_REALM_URL` | URL du realm Keycloak (ex: `https://auth.example.com/realms/myrealm`) |
| `KEYCLOAK_CLIENT_ID` | Client ID du client Keycloak |
| `KEYCLOAK_CLIENT_SECRET` | Client Secret du client Keycloak |

!!! tip "URIs de callback à configurer"
    Pour chaque provider, l'URI de callback à enregistrer dans la console du fournisseur est :
    ```
    {FRONTEND_URL}/api/auth/social/{provider}/callback
    ```
    Exemple : `http://localhost:4000/api/auth/social/microsoft/callback`

    Exception : Google utilise `GOOGLE_SSO_REDIRECT_URI` (voir section précédente).

### Multi-utilisateurs (v2.0)

| Variable | Défaut | Description |
|---|---|---|
| `ADMIN_EMAIL` | *(vide)* | L'utilisateur qui s'inscrit avec cet email obtient automatiquement le rôle `admin` |
| `ALLOW_REGISTRATION` | `true` | Mettre à `false` pour fermer les inscriptions (formulaire + Google SSO) |

### PostgreSQL

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Nom de la base de données |

---

## Injection des variables d'environnement

### Dev local (hors Docker)

Le backend charge automatiquement le fichier `.env` à la racine du projet grâce à `dotenv/config`. Créez-le à partir du template :

```bash
cp .env.example .env
# Éditez .env avec vos valeurs
```

Le frontend en mode dev (`npm run dev`) utilise le proxy Vite qui redirige `/api` vers `VITE_API_URL` (défaut : `http://localhost:4000`).

### Docker prod

Les variables sont injectées via `docker-compose.yml` → section `environment:`. Docker Compose résout automatiquement les `${VAR}` depuis le fichier `.env` présent à la racine.

Le frontend prod (nginx) n'a besoin d'aucune variable d'environnement : il proxie les appels `/api` directement vers le service `backend` via le réseau Docker interne.

### Docker dev

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Le fichier `docker-compose.dev.yml` surcharge le compose prod : volumes montés pour hot reload, ports debug et base de données exposés, `NODE_ENV=development`.

---

## Limites Gmail API

Gmail API impose des quotas. La configuration suivante dans `backend/src/config.ts` est calibrée pour rester sous les limites :

```typescript
GMAIL_BATCH_SIZE: 100,    // Max 100 requêtes par batch
GMAIL_THROTTLE_MS: 500,   // Pause entre chaque batch
```

!!! info "Quota Gmail"
    La limite officielle est de 250 unités/user/seconde. Le throttling à 500ms entre batches de 100 requêtes est conservateur et évite les erreurs 429.

---

## Volumes Docker

```yaml
# docker-compose.yml
volumes:
  - ./volumes/archives:/archives    # Archives EML
  - postgres_data:/var/lib/postgresql/data
  - redis_data:/data
```

### Pointer vers un NAS Synology

```yaml
volumes:
  - /volume1/gmail-archives:/archives
```

### Pointer vers un NAS TrueNAS

```yaml
volumes:
  - /mnt/pool/gmail-archives:/archives
```

---

## Documentation API (Swagger)

La documentation Swagger est disponible en développement à :

```
http://localhost:4000/docs
```

Elle est générée automatiquement par `@fastify/swagger` et liste tous les endpoints avec leurs schémas de requête et réponse.
