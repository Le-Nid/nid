<p align="center">
  <img src="/assets/nid-logo-full-light.svg" alt="Nid" height="80" />
</p>

**Nid** est une application self-hosted de gestion et d'archivage de boîtes Gmail, déployée entièrement via Docker sur votre NAS.

Elle remplace des outils comme Gmail Cleaner et OpenArchiver, sans envoyer vos données vers des serveurs tiers.

---

## Fonctionnalités

| Module | Fonctionnalités |
|---|---|
| 📊 **Vue d'ensemble** | Chiffres clés en temps réel, gros expéditeurs, suggestions de nettoyage |
| 📬 **Mails** | Recherche Gmail à jetons, recherches enregistrées, actions en masse avec annulation, lecteur, raccourcis clavier, « Tous les comptes » |
| 🧹 **Nettoyage** | Expéditeurs et newsletters (List-Unsubscribe), gros mails, désabonnement et suppression en masse |
| 🤖 **Règles** | Conditions Gmail + actions, planification, modèles prêts à l'emploi, libellés |
| 📦 **Archives** | Stockage EML sur NAS (Gmail et comptes IMAP), recherche plein texte avec surlignage, y compris dans les PDF et DOCX joints, filtres taille / type de pièce jointe, restauration dans la boîte mail, partage par lien, corbeille, rétention |
| 📎 **Pièces jointes** | Gmail et archives, aperçu des images et PDF, déduplication |
| ⚙️ **Activité** | Suivi des jobs en temps réel (BullMQ + SSE), annuler, relancer |
| 🔐 **Comptes** | JWT local, SSO Google et autres fournisseurs, 2FA/TOTP, multi-utilisateurs, sauvegarde automatique par compte Gmail |
| 🔔 **Notifications** | In-app, webhooks (Discord, Slack, Ntfy, HTTP), rapport hebdomadaire |
| 🛡️ **Admin** | Utilisateurs, quota Gmail API, journal d'audit, intégrité des archives, corbeille globale |
| 🔒 **Vie privée** | Images distantes (et pixels espions) bloquées par le lecteur jusqu'à « Afficher » |
| 💾 **Données** | Export/import de la configuration, import IMAP / mbox / .eml, export mbox |
| 🌐 **i18n** | Français / Anglais, thème clair/sombre, mobile |

---

## Documentation

Cette documentation est organisée en trois parties :



-   📥 **[Installation](installation/index.md)**

    ---

    Démarrage rapide, configuration Google Cloud, variables d'environnement, déploiement production, environnement de développement.

-   📖 **[Guide utilisateur](guide/index.md)**

    ---

    Comment utiliser chaque fonctionnalité de l'application. Idéal pour les utilisateurs de tous niveaux.

-   🔧 **[Documentation technique](technical/overview.md)**

    ---

    Architecture, base de données, sécurité, référence API complète. Pour les développeurs et contributeurs.



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

::: tip Première utilisation
Consultez le [guide des premiers pas](guide/first-steps.md) pour créer votre compte et connecter Gmail.
:::

---

## Stack technique

```
Frontend   →  React 19 + shadcn/ui (Radix) + Tailwind v4 + react-i18next
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
