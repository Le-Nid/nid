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

!!! info "Sécurité réseau"
    En production, PostgreSQL et Redis ne sont **pas** exposés sur l'hôte. Ils communiquent uniquement via le réseau Docker interne.

---

## Versioning

Nid utilise le **Semantic Versioning** (SemVer). Le numéro de version est défini dans le fichier `VERSION` à la racine du projet.

### Fichier VERSION

Le fichier `VERSION` contient uniquement le numéro de version (ex. `0.1.0`). Il est la source de vérité unique pour la version de l'application.

### Tags Docker

Lors du publish Docker (GitHub Actions), le workflow lit le fichier `VERSION` et génère trois tags :

| Tag | Exemple | Description |
|---|---|---|
| `latest` | `ghcr.io/le-nid/nid:latest` | Dernière version publiée |
| Version | `ghcr.io/le-nid/nid:0.1.0` | Tag de version fixe |
| Branche/tag Git | `ghcr.io/le-nid/nid:main` | Branche ou tag Git |

### Mettre à jour la version

1. Modifiez le fichier `VERSION` avec le nouveau numéro
2. Committez et poussez sur `main`
3. Le workflow `docker-publish.yml` build et publie automatiquement l'image avec les bons tags

```bash
echo "0.2.0" > VERSION
git add VERSION && git commit -m "bump version to 0.2.0"
git push
```

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

Assurez-vous que le répertoire est accessible en écriture par l'utilisateur Docker (UID 1001).

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
    location /api/jobs/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

!!! warning "SSE et timeouts"
    Le suivi temps réel des jobs utilise les Server-Sent Events. Assurez-vous que votre reverse proxy ne coupe pas les connexions longues (`proxy_read_timeout` élevé, `proxy_buffering off`).

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

Utilisez la fonction d'[export de configuration](../guide/settings.md#export--import-de-configuration) intégrée pour sauvegarder vos règles et webhooks au format JSON.

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
