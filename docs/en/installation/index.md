# Quick Start

Install Nid in 5 minutes with Docker.

---

## Prerequisites

- **Docker** ≥ 24 and **Docker Compose** ≥ 2.20
- **A Google Cloud account** with the Gmail API enabled ([detailed guide](google-cloud.md))
- A server or NAS with at least 1 GB of available RAM

---

## 1. Clone the Repository

```bash
git clone https://github.com/le-nid/nid.git
cd nid
```

---

## 2. Configure the Environment

```bash
cp .env.example .env
```

Edit the `.env` file with the minimum required values:

```bash
# JWT Secrets — generate random values
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# Google credentials (see Google Cloud guide)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret

# First administrator
ADMIN_EMAIL=your@email.com

# Database
POSTGRES_USER=gmailmanager
POSTGRES_PASSWORD=a_strong_password
POSTGRES_DB=gmailmanager
```

::: tip Full Configuration
See the [detailed configuration page](configuration.md) for all available environment variables (social SSO, quotas, Gmail throttling, etc.).
:::

---

## 3. Launch the Application

```bash
docker compose up -d
```

---

## 4. Verify

```bash
# Check all services are up
docker compose ps

# API health check
curl http://localhost:3000/api/auth/config
```

The application is accessible at [http://localhost:3000](http://localhost:3000).

---

## What's Next?

1. **[Create your account and connect Gmail](../guide/first-steps.md)** — first steps in the application
2. **[Detailed configuration](configuration.md)** — all environment variables
3. **[Google Cloud setup](google-cloud.md)** — step-by-step guide for OAuth2 credentials
4. **[Production deployment](production.md)** — NAS, reverse proxy, security
5. **[Development environment](development.md)** — hot reload, debug, contributing
