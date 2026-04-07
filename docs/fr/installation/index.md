# Démarrage rapide

Installez Nid en 5 minutes avec Docker.

---

## Prérequis

- **Docker** ≥ 24 et **Docker Compose** ≥ 2.20
- **Un compte Google Cloud** avec l'API Gmail activée ([guide détaillé](google-cloud.md))
- Un serveur ou NAS avec au minimum 1 Go de RAM disponible

---

## 1. Cloner le dépôt

```bash
git clone https://github.com/le-nid/nid.git
cd nid
```

---

## 2. Configurer l'environnement

```bash
cp .env.example .env
```

Éditez le fichier `.env` avec les valeurs minimales :

```bash
# Secrets JWT — générez des valeurs aléatoires
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# Credentials Google (voir guide Google Cloud)
GOOGLE_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-votre_secret

# Premier administrateur
ADMIN_EMAIL=votre@email.com

# Base de données
POSTGRES_USER=gmailmanager
POSTGRES_PASSWORD=un_mot_de_passe_fort
POSTGRES_DB=gmailmanager
```

::: tip Configuration complète
Consultez la [page de configuration détaillée](configuration.md) pour toutes les variables d'environnement disponibles (SSO social, quotas, throttling Gmail, etc.).
:::

---

## 3. Lancer l'application

```bash
docker compose up -d
```

---

## 4. Vérifier

```bash
# Vérifier que tous les services sont up
docker compose ps

# Health check de l'API
curl http://localhost:3000/api/auth/config
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

---

## Et ensuite ?

1. **[Créer votre compte et connecter Gmail](../guide/first-steps.md)** — premiers pas dans l'application
2. **[Configuration détaillée](configuration.md)** — toutes les variables d'environnement
3. **[Configuration Google Cloud](google-cloud.md)** — guide pas à pas pour les credentials OAuth2
4. **[Déploiement production](production.md)** — NAS, reverse proxy, sécurité
5. **[Environnement de développement](development.md)** — hot reload, debug, contribution
