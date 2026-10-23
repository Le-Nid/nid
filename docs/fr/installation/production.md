# Déploiement en production

Guide pour déployer Nid sur un serveur ou un NAS.

---

## Architecture de production

En production, Nid utilise une **image Docker unifiée** qui contient :

- Le **backend** Node.js (Fastify)
- Le **frontend** React (servi par Nginx)
- Un **reverse proxy** Nginx qui route `/api` vers le backend et sert les fichiers statiques du frontend

Un seul port est exposé : `3000` (configurable via `APP_PORT`).

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

::: info Sécurité réseau
En production, PostgreSQL et Redis ne sont **pas** exposés sur l'hôte. Ils communiquent uniquement via le réseau Docker interne.
:::

---

## Versioning

Nid utilise le **Semantic Versioning** (SemVer). Les versions sont calculées automatiquement par [release-please](https://github.com/googleapis/release-please) à partir des messages de commit au format [Conventional Commits](https://www.conventionalcommits.org/fr/).

### Calcul de la version

| Commit | Effet sur la version |
|---|---|
| `fix: …` | patch (`0.2.1` → `0.2.2`) |
| `feat: …` | minor (`0.2.1` → `0.3.0`) |
| `feat!: …` ou pied `BREAKING CHANGE:` | minor tant que la version est < 1.0.0, puis major |
| `chore`, `ci`, `test`, `refactor`, `build` | aucun (n'apparaît pas dans le changelog) |

### Publier une release

1. À chaque push sur `main`, le workflow `release-please.yml` ouvre (ou met à jour) une PR **« chore(main): release X.Y.Z »**. Elle met à jour `VERSION`, la version des `package.json` backend/frontend et `CHANGELOG.md`.
2. Merger cette PR crée le tag `vX.Y.Z` et la GitHub Release, puis publie l'image Docker versionnée.

Ne modifiez pas `VERSION` à la main : release-please en est la source. Pour forcer un numéro, ajoutez un commit avec le pied `Release-As: X.Y.Z`.

Prérequis côté dépôt : *Settings → Actions → General → « Allow GitHub Actions to create and approve pull requests »* doit être activé.

### Tags Docker

| Tag | Exemple | Publié | Version affichée (`APP_VERSION`) |
|---|---|---|---|
| `latest` | `ghcr.io/le-nid/nid:latest` | à chaque release | `0.3.0` |
| Version | `ghcr.io/le-nid/nid:0.3.0`, `ghcr.io/le-nid/nid:0.3` | à chaque release | `0.3.0` |
| `main` | `ghcr.io/le-nid/nid:main` | à chaque push sur `main` | `0.2.1-main.<sha>` |
| Commit | `ghcr.io/le-nid/nid:sha-1a2b3c4` | à chaque push sur `main` | `0.2.1-main.1a2b3c4` |

Pour une instance de production, suivez `latest` (ou épinglez une version). `main` suit le développement en continu.

### Dans le Dockerfile

Le `ARG APP_VERSION` est injecté au build. Il est utilisé pour :

- Le label OCI `org.opencontainers.image.version`
- La variable d'environnement `APP_VERSION` accessible au runtime dans le backend

---

## Lancement

```bash
docker compose up -d
```

Vérifiez que tous les services sont sains :

```bash
docker compose ps
# Tous les services doivent afficher "healthy"
```

---

## Configuration du stockage NAS

Le volume `./volumes/archives` est monté vers `/archives` dans le conteneur. Pour stocker les archives sur votre NAS :

```yaml
# docker-compose.yml
services:
  app:
    volumes:
      - /chemin/vers/votre/nas/gmail-archives:/archives
```

Assurez-vous que le répertoire existe sur l'hôte. Les permissions sont corrigées automatiquement au démarrage du conteneur (`chown` vers UID 1001).

::: info Dépannage : permission refusée
Si l'archivage échoue avec une erreur de permissions, vérifiez que le conteneur a bien démarré en tant que `root` (nécessaire pour le `chown` initial). Vous pouvez aussi corriger manuellement :
```bash
sudo chown -R 1001:1001 ./volumes/archives
```
:::

---

## Reverse proxy (optionnel)

Si vous souhaitez exposer Nid sur Internet ou avec un certificat HTTPS, utilisez un reverse proxy.

### Caddy (recommandé)

```
gmail.mondomaine.fr {
    reverse_proxy localhost:3000
}
```

Caddy gère automatiquement les certificats Let's Encrypt.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name gmail.mondomaine.fr;

    ssl_certificate /etc/letsencrypt/live/gmail.mondomaine.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gmail.mondomaine.fr/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE (Server-Sent Events) — timeout élevé
    location ~ ^/api/(jobs/.+/)?events$ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

::: warning SSE et timeouts
Le suivi temps réel des jobs utilise les Server-Sent Events. Assurez-vous que votre reverse proxy ne coupe pas les connexions longues (`proxy_read_timeout` élevé, `proxy_buffering off`).
:::

### Traefik

```yaml
# docker-compose.yml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gmail.rule=Host(`gmail.mondomaine.fr`)"
      - "traefik.http.routers.gmail.tls.certresolver=letsencrypt"
      - "traefik.http.services.gmail.loadbalancer.server.port=3000"
```

---

## Mises à jour

```bash
cd nid
git pull
docker compose up -d --build
```

Les données sont persistées dans les volumes Docker (PostgreSQL, Redis, archives EML). La reconstruction des conteneurs ne les efface pas.

---

## Sauvegardes

### Base de données

```bash
docker compose exec postgres pg_dump -U gmailmanager gmailmanager > backup.sql
```

### Archives EML

Sauvegardez simplement le dossier monté (ex. `/mnt/nas/gmail-archives/`). Les fichiers EML sont au format standard, lisibles par n'importe quel client mail.

### Configuration applicative

Utilisez la fonction d'[export de configuration](../guide/settings.md#configuration) intégrée pour sauvegarder vos règles et webhooks au format JSON.

---

## Fermer les inscriptions

Une fois vos utilisateurs créés, fermez les inscriptions :

```bash
# Dans .env
ALLOW_REGISTRATION=false
```

```bash
docker compose up -d
```

Les tentatives d'inscription (formulaire ou Google SSO) retourneront une erreur 403.
