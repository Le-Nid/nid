# Detailed Configuration

All Nid environment variables, defined in the `.env` file at the project root.

---

## Application

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_URL` | `http://localhost:3000` | Public URL of the application. Used for OAuth2 redirections and callback URI generation |
| `APP_PORT` | `3000` | Exposed application port (unified production) |
| `ARCHIVE_PATH` | `/archives` | Internal Docker path for EML archive storage |
| `NODE_ENV` | `development` | Runtime environment (`development` / `production`) |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |

---

## JWT (Authentication)

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | **Required.** Signing secret for access tokens. Generate with `openssl rand -hex 64` |
| `JWT_EXPIRY` | `24h` | Session token validity (the auth cookie lasts 24h, keep it ≤ 24h) |

::: warning Security
Use long random secrets (at least 64 hexadecimal characters).
:::

---

## Google OAuth2

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | **Required.** Client ID from your Google Cloud project |
| `GOOGLE_CLIENT_SECRET` | — | **Required.** Client Secret from your Google Cloud project |
| `GOOGLE_REDIRECT_URI` | *(derived from FRONTEND_URL)* | Callback URI for connecting Gmail accounts |
| `GOOGLE_SSO_REDIRECT_URI` | *(derived from FRONTEND_URL)* | Callback URI for Google SSO login |

::: info Automatic derivation in Docker prod
In production, `docker-compose.yml` automatically derives callback URIs from `FRONTEND_URL` (e.g. `${FRONTEND_URL}/api/auth/gmail/callback`). You only need to set `FRONTEND_URL`.

In local development (outside Docker), explicitly set `GOOGLE_REDIRECT_URI` and `GOOGLE_SSO_REDIRECT_URI` pointing to the backend port (4000).
:::

---

## Social Login (SSO)

In addition to Google SSO, you can enable other authentication providers. Each provider is **automatically enabled** as soon as its `CLIENT_ID` and `CLIENT_SECRET` variables are defined.

### Microsoft

| Variable | Description |
|---|---|
| `MICROSOFT_CLIENT_ID` | Client ID from your Microsoft Entra app. [Create on portal.azure.com](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps) |
| `MICROSOFT_CLIENT_SECRET` | Client Secret from your Microsoft Entra app |

### Discord

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID from your Discord app. [Create on discord.com/developers](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_SECRET` | Client Secret from your Discord app |

### Facebook

| Variable | Description |
|---|---|
| `FACEBOOK_CLIENT_ID` | Meta App ID. [Create on developers.facebook.com](https://developers.facebook.com/apps) |
| `FACEBOOK_CLIENT_SECRET` | Meta App Secret |

### LinkedIn

| Variable | Description |
|---|---|
| `LINKEDIN_CLIENT_ID` | LinkedIn Client ID. [Create on linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Client Secret |

### Keycloak

| Variable | Description |
|---|---|
| `KEYCLOAK_REALM_URL` | Keycloak realm URL (e.g. `https://auth.example.com/realms/myrealm`) |
| `KEYCLOAK_CLIENT_ID` | Keycloak client Client ID |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak client Client Secret |

::: tip Callback URI
For each provider, the callback URI to register in the provider's console is:
```
{FRONTEND_URL}/api/auth/social/{provider}/callback
```
Example: `http://localhost:3000/api/auth/social/microsoft/callback`
:::

---

## Multi-user

| Variable | Default | Description |
|---|---|---|
| `ADMIN_EMAIL` | *(empty)* | The user who signs up with this email automatically gets the `admin` role |
| `ALLOW_REGISTRATION` | `true` | `false` to close registrations (form and SSO). Attempts will return a 403 error |
| `METRICS_TOKEN` | *(empty)* | Bearer token of `GET /api/metrics` (Prometheus, see [Production](production.md#monitoring-prometheus)). Empty: endpoint disabled |
| `WEBHOOK_ALLOW_PRIVATE_NETWORKS` | `false` | `true` to let webhooks target the local network (ntfy, Home Assistant on your LAN). Off by default: any user could otherwise probe internal services (SSRF) |
| `BULK_QUERY_MAX` | `50000` | Max number of mails a bulk action sent with a Gmail `query` ("select all results") processes; the job stops there and reports it. Also caps the new mails one NAS backup by `query` saves |
| `ARCHIVE_CONTINUE_DELAY_MIN` | `15` | A NAS backup by `query` stopped at `BULK_QUERY_MAX` resumes automatically after this many minutes |
| `ARCHIVE_CHAIN_MAX` | `20` | Max automatic continuations in a row for one NAS backup by `query` |

---

## PostgreSQL

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DB` | Database name |
| `DATABASE_URL` | *(automatically derived in Docker)* Full connection URL |

---

## Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `REDIS_PASSWORD` | *(empty)* | Redis password (recommended in production) |

---

## Gmail API Throttling

Gmail API enforces quotas (250 units/user/second). These variables control the throughput:

| Variable | Default | Description |
|---|---|---|
| `GMAIL_BATCH_SIZE` | `25` | Number of parallel requests per batch |
| `GMAIL_THROTTLE_MS` | `1000` | Pause in milliseconds between each batch |
| `GMAIL_CONCURRENCY` | `10` | Maximum number of concurrent requests to Gmail API |

::: info Tuning
With multiple users active simultaneously, increase `GMAIL_THROTTLE_MS` or decrease `GMAIL_BATCH_SIZE` to avoid 429 errors (rate limit).
:::

---

## Docker Volumes

### Default configuration

```yaml
volumes:
  - ./volumes/archives:/archives    # EML archives
  - postgres_data:/var/lib/postgresql/data
  - redis_data:/data
```

### Pointing to a NAS

::: code-group

```yaml [Synology]
volumes:
  - /volume1/gmail-archives:/archives
```

```yaml [TrueNAS]
volumes:
  - /mnt/pool/gmail-archives:/archives
```

```yaml [Custom path]
volumes:
  - /path/to/your/archives:/archives
```

:::

---

## API Documentation (Swagger)

The Swagger documentation is available in development at:

```
http://localhost:4000/docs
```

In production (unified image):

```
http://localhost:3000/api/docs
```

It is automatically generated by `@fastify/swagger` and lists all endpoints with their schemas.
