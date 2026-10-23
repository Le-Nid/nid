# Production Deployment

Guide to deploying Nid on a server or NAS.

---

## Production Architecture

In production, Nid uses a **unified Docker image** that contains:

- The **backend** Node.js (Fastify)
- The **frontend** React (served by Nginx)
- A **reverse proxy** Nginx that routes `/api` to the backend and serves the frontend's static files

A single port is exposed: `3000` (configurable via `APP_PORT`).

```
┌─────────────────────────────────────┐
│           Container "app"           │
│                                     │
│   Nginx (:3000)                     │
│   ├── /api/* → Backend Node (:4000) │
│   └── /*     → Frontend statique    │
│                                     │
│   Backend Node.js (:4000 interne)   │
└─────────────────────────────────────┘
         │              │
    ┌────┴────┐    ┌────┴────┐
    │ Postgres │    │  Redis  │
    │  (:5432) │    │ (:6379) │
    └─────────┘    └─────────┘
```

::: info Network Security
In production, PostgreSQL and Redis are **not** exposed on the host. They communicate only through the internal Docker network.
:::

---

## Versioning

Nid uses **Semantic Versioning** (SemVer). Releases are **fully automatic**: on each push to `main`, the `release.yml` workflow runs [semantic-release](https://semantic-release.gitbook.io/), which computes the version from commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) format since the last tag.

| Commits since the last release | Result |
|---|---|
| at least one `fix: …` or `perf: …` | patch (`0.2.1` → `0.2.2`) |
| at least one `feat: …` | minor (`0.2.1` → `0.3.0`) |
| `feat!: …` or a `BREAKING CHANGE:` footer | major (`0.2.1` → `1.0.0`) |
| only `chore`, `ci`, `docs`, `test`, `refactor`, `build` | no release |

When a release is created, the same run produces, with the same number:

- the `X.Y.Z` git tag and the **GitHub Release** (notes generated from the commits);
- the `ghcr.io/le-nid/nid:X.Y.Z` Docker image, plus `ghcr.io/le-nid/nid:latest`.

The number is not stored in any file: the latest git tag is the source of truth. Nothing needs to be edited by hand.

### In the Dockerfile

The `ARG APP_VERSION` is injected at build time. It is used for:

- The OCI label `org.opencontainers.image.version`
- The `APP_VERSION` environment variable accessible at runtime in the backend (version shown in the app)

---

## Startup

```bash
docker compose up -d
```

Verify that all services are healthy:

```bash
docker compose ps
# All services should show "healthy"
```

---

## NAS Storage Configuration

The `./volumes/archives` volume is mounted to `/archives` in the container. To store archives on your NAS:

```yaml
# docker-compose.yml
services:
  app:
    volumes:
      - /chemin/vers/votre/nas/gmail-archives:/archives
```

Make sure the directory exists on the host. Permissions are automatically corrected at container startup (`chown` to UID 1001).

::: info Troubleshooting: permission denied
If archiving fails with a permission error, verify that the container started as `root` (required for the initial `chown`). You can also fix permissions manually:
```bash
sudo chown -R 1001:1001 ./volumes/archives
```
:::

---

## Reverse Proxy (Optional)

If you want to expose Nid on the Internet or with an HTTPS certificate, use a reverse proxy.

### Caddy (Recommended)

```
gmail.mydomain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically manages Let's Encrypt certificates.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name gmail.mydomain.com;

    ssl_certificate /etc/letsencrypt/live/gmail.mydomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gmail.mydomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE (Server-Sent Events) — high timeout
    location ~ ^/api/(jobs/.+/)?events$ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

::: warning SSE and Timeouts
Real-time job tracking uses Server-Sent Events. Make sure your reverse proxy does not cut long-lived connections (high `proxy_read_timeout`, `proxy_buffering off`).
:::

### Traefik

```yaml
# docker-compose.yml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gmail.rule=Host(`gmail.mydomain.com`)"
      - "traefik.http.routers.gmail.tls.certresolver=letsencrypt"
      - "traefik.http.services.gmail.loadbalancer.server.port=3000"
```

---

## Updates

```bash
cd nid
git pull
docker compose up -d --build
```

Data is persisted in Docker volumes (PostgreSQL, Redis, EML archives). Rebuilding containers does not erase them.

---

## Backups

### Database

```bash
docker compose exec postgres pg_dump -U gmailmanager gmailmanager > backup.sql
```

### EML Archives

Simply back up the mounted directory (e.g. `/mnt/nas/gmail-archives/`). EML files are in standard format, readable by any mail client.

### Application Configuration

Use the built-in [configuration export](../guide/settings.md#configuration) feature to back up your rules and webhooks in JSON format.

---

## Closing Registrations

Once your users are created, close registrations:

```bash
# In .env
ALLOW_REGISTRATION=false
```

```bash
docker compose up -d
```

Registration attempts (form or Google SSO) will return a 403 error.
