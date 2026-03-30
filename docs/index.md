# Gmail Manager

**Gmail Manager** est une application self-hosted de gestion et d'archivage de boîtes Gmail, déployée entièrement via Docker sur votre NAS.

Elle remplace des outils comme Gmail Cleaner et OpenArchiver, sans envoyer vos données vers des serveurs tiers.

---

## Fonctionnalités

| Module | Fonctionnalités |
|---|---|
| 📊 **Dashboard** | Top expéditeurs, mails les plus gros, timeline, répartition labels |
| 📬 **Gestion mails** | Bulk delete/label/archive, lecture, pièces jointes, règles auto |
| 📦 **Archives** | Stockage EML sur NAS, recherche full-text, différentiel |
| ⚙️ **Jobs** | Suivi en temps réel des opérations longues (BullMQ + SSE) |
| 🔐 **Auth** | JWT local + Google SSO, 2FA/TOTP, multi-utilisateurs avec rôles |
| 📧 **Unsubscribe** | Scan des headers List-Unsubscribe, désabonnement en un clic |
| 📎 **Pièces jointes** | Gestionnaire dédié (live Gmail + archives), tri par taille |
| 🔁 **Doublons** | Détection et suppression des mails archivés en double |
| 📋 **Templates** | Bibliothèque de règles pré-configurées, activation en un clic |
| 📈 **Insights** | Rapport hebdomadaire, notifications in-app |
| 📝 **Audit log** | Journal d'activité traçant les actions sensibles |
| 🔗 **Webhooks** | Notifications Discord, Slack, Ntfy ou HTTP générique |
| 🛡️ **Intégrité** | Vérification de cohérence archives disque ↔ BDD |
| ⌨️ **Raccourcis clavier** | Navigation et actions rapides dans Mes mails |
| 💾 **Export/Import** | Sauvegarde et restauration de la configuration (règles, webhooks) |

---

## Stack technique

```
Frontend   →  React 19 + Ant Design
Backend    →  Fastify + TypeScript
Auth       →  JWT local + OAuth2 Gmail
Base de données  →  PostgreSQL 16
Queue      →  BullMQ + Redis
Archives   →  EML + index PostgreSQL
```

---

## Démarrage rapide

```bash
git clone https://github.com/befa160/gmail-manager.git
cd gmail-manager
cp .env.example .env
# Éditer .env avec vos credentials Google et vos secrets
docker compose up -d
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

!!! tip "Première utilisation"
    Après votre premier login, rendez-vous dans **Paramètres** pour connecter votre compte Gmail via OAuth2.

---

## Pourquoi self-hosted ?

- ✅ Vos mails restent sur votre NAS — aucune donnée ne sort de votre réseau
- ✅ Gratuit, pas d'abonnement
- ✅ Full control : archives au format EML standard, lisibles par n'importe quel client mail
- ✅ Multi-compte Gmail depuis une seule interface
