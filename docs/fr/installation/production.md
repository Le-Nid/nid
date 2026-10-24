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

Nid utilise le **Semantic Versioning** (SemVer). Les releases sont **entièrement automatiques** : à chaque push sur `main`, le workflow `release.yml` lance [semantic-release](https://semantic-release.gitbook.io/), qui calcule la version à partir des messages de commit au format [Conventional Commits](https://www.conventionalcommits.org/fr/) depuis le dernier tag.

| Commits depuis la dernière release | Résultat |
|---|---|
| au moins un `fix: …` ou `perf: …` | patch (`0.2.1` → `0.2.2`) |
| au moins un `feat: …` | minor (`0.2.1` → `0.3.0`) |
| `feat!: …` ou pied `BREAKING CHANGE:` | major (`0.2.1` → `1.0.0`) |
| seulement `chore`, `ci`, `docs`, `test`, `refactor`, `build` | pas de release |

Quand une release est créée, le même run produit, avec le même numéro :

- le tag git `X.Y.Z` et la **GitHub Release** (notes générées depuis les commits) ;
- l'image Docker `ghcr.io/le-nid/nid:X.Y.Z`, ainsi que `ghcr.io/le-nid/nid:latest`.

Le numéro n'est stocké dans aucun fichier : la source de vérité est le dernier tag git. Il n'y a rien à modifier à la main.

### Dans le Dockerfile

Le `ARG APP_VERSION` est injecté au build. Il est utilisé pour :

- Le label OCI `org.opencontainers.image.version`
- La variable d'environnement `APP_VERSION` accessible au runtime dans le backend (version affichée dans l'application)

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

`scripts/backup-db.sh` fait un dump PostgreSQL (format custom, compressé) via `docker compose`, dans `./backups` ou le dossier passé en argument, et garde les `KEEP` derniers (14 par défaut). Les identifiants sont lus dans le conteneur `postgres` : pas besoin de `.env`. À lancer depuis le dossier du `docker-compose.yml`, par exemple chaque nuit :

```bash
# crontab -e
15 3 * * * cd /opt/nid && scripts/backup-db.sh /mnt/nas/nid-backups >> backups.log 2>&1
```

Restauration (remplace **toute** la base ; l'app est arrêtée pendant l'opération puis relancée, les migrations repassent au démarrage) :

```bash
scripts/restore-db.sh /mnt/nas/nid-backups/nid-db-20261024-031500.dump
```

La restauration est en une seule transaction : si elle échoue, la base reste telle qu'avant.

### Archives EML

Sauvegardez le dossier monté (ex. `/mnt/nas/gmail-archives/`) **après** le dump de la base, par exemple `rsync -a` dans le même cron. La base référence les fichiers : un fichier plus récent que le dump est simplement orphelin après restauration, un fichier manquant est signalé par le [contrôle d'intégrité](../guide/admin.md#integrite-des-archives). Les fichiers EML sont au format standard, lisibles par n'importe quel client mail.

### Configuration applicative

Utilisez la fonction d'[export de configuration](../guide/settings.md#configuration) intégrée pour sauvegarder vos règles et webhooks au format JSON.

---

## Supervision (Prometheus)

Définissez `METRICS_TOKEN` (ex. `openssl rand -hex 32`) pour activer `GET /api/metrics` ; sans lui, l'endpoint n'existe pas. Métriques exposées : `nid_http_request_duration_seconds` (par méthode, motif de route et statut), `nid_queue_jobs{state}` (file BullMQ), `nid_gmail_rate_limited_24h`, `nid_redis_up` (0 : Redis illisible, les deux précédentes sont figées), et les métriques process Node (`nid_process_*`, `nid_nodejs_*`).

```yaml
# prometheus.yml
scrape_configs:
  - job_name: nid
    scheme: https
    metrics_path: /api/metrics
    authorization:
      credentials: <METRICS_TOKEN>
    static_configs:
      - targets: ['nid.example.com']
```

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
