<p align="center">
  <img src="assets/nid-logo-full-light.svg" alt="Nid" height="80" />
</p>

**Nid** est une application self-hosted de gestion et d'archivage de boîtes Gmail, déployée entièrement via Docker sur votre NAS.

Elle remplace des outils comme Gmail Cleaner et OpenArchiver, sans envoyer vos données vers des serveurs tiers.

---

## Fonctionnalités

| Module | Fonctionnalités |
|---|---|
| 📊 **Dashboard** | Top expéditeurs, mails les plus gros, timeline, répartition labels |
| 📬 **Gestion mails** | Bulk delete/label/archive, lecture, pièces jointes, règles auto |
| 📦 **Archives** | Stockage EML sur NAS, recherche full-text, différentiel |
| ⚙️ **Jobs** | Suivi en temps réel des opérations longues (BullMQ + SSE) |
| 🔐 **Auth** | JWT local + Google SSO + multi-providers, 2FA/TOTP, multi-utilisateurs |
| 📧 **Newsletters** | Scan des headers List-Unsubscribe, nettoyage en masse |
| 📎 **Pièces jointes** | Gestionnaire dédié (live Gmail + archives), tri par taille |
| 🔁 **Doublons** | Détection et suppression des mails archivés en double |
| 📋 **Templates** | Bibliothèque de règles pré-configurées, activation en un clic |
| 📈 **Analytics** | Heatmap, scores d'encombrement, suggestions de nettoyage, Inbox Zero |
| 📝 **Audit log** | Journal d'activité traçant les actions sensibles |
| 🔗 **Webhooks** | Notifications Discord, Slack, Ntfy ou HTTP générique |
| 🛡️ **Intégrité** | Vérification de cohérence archives disque ↔ BDD |
| 🔒 **Vie privée** | Détection pixels espions, scanner PII, chiffrement AES-256 des archives |
| ⌨️ **Raccourcis clavier** | Navigation et actions rapides dans Mes mails |
| 💾 **Export/Import** | Sauvegarde et restauration de la configuration (règles, webhooks) |
| 🌐 **i18n** | Français / Anglais, sélecteur de langue, persistance du choix |
| 📬 **Boîte unifiée** | Tous vos comptes Gmail en une seule vue |
| 🔍 **Recherches** | Recherches sauvegardées avec icônes et couleurs |
| ⚙️ **Ops & Résilience** | Stockage S3/MinIO, politiques de rétention, suivi quota Gmail API, import IMAP/mbox, export mbox |

---

## Documentation

Cette documentation est organisée en trois parties :

<div class="grid cards" markdown>

-   📥 **[Installation](installation/index.md)**

    ---

    Démarrage rapide, configuration Google Cloud, variables d'environnement, déploiement production, environnement de développement.

-   📖 **[Guide utilisateur](guide/index.md)**

    ---

    Comment utiliser chaque fonctionnalité de l'application. Idéal pour les utilisateurs de tous niveaux.

-   🔧 **[Documentation technique](technical/overview.md)**

    ---

    Architecture, base de données, sécurité, référence API complète. Pour les développeurs et contributeurs.

</div>

---

## Démarrage rapide

```bash
git clone https://github.com/le-nid/nid.git
cd nid
cp .env.example .env
# Éditer .env avec vos credentials Google et vos secrets
docker compose up -d
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

!!! tip "Première utilisation"
    Consultez le [guide des premiers pas](guide/first-steps.md) pour créer votre compte et connecter Gmail.

---

## Stack technique

```
Frontend   →  React 19 + Ant Design + react-i18next
Backend    →  Fastify + TypeScript
Auth       →  JWT local + OAuth2 Gmail + SSO multi-providers
Base de données  →  PostgreSQL 16 (Kysely)
Queue      →  BullMQ + Redis
Archives   →  EML + index PostgreSQL
i18n       →  Français 🇫🇷 / Anglais 🇬🇧 (extensible)
```

---

## Pourquoi self-hosted ?

- ✅ Vos mails restent sur votre NAS — aucune donnée ne sort de votre réseau
- ✅ Gratuit, pas d'abonnement
- ✅ Full control : archives au format EML standard, lisibles par n'importe quel client mail
- ✅ Multi-compte Gmail depuis une seule interface
