# Paramètres

Les **Paramètres** (`/settings/…`) sont découpés en cinq sections, en onglets sur ordinateur et listées dans la page **Plus** sur mobile :

| Section | Adresse |
|---|---|
| [Compte](#compte) | `/settings/account` |
| [Sécurité](#securite) | `/settings/security` |
| [Comptes Gmail](#comptes-gmail) | `/settings/gmail` |
| [Notifications & webhooks](#notifications-webhooks) | `/settings/notifications` |
| [Données](#donnees) | `/settings/data` |

---

## Compte

- **Profil** : avatar, nom, email, et l'espace occupé par vos archives (« Archives : X utilisés sur Y », quota fixé par l'administrateur).
- **Langue et apparence** : **Langue** (français / anglais) et **Thème** (**Système**, **Clair**, **Sombre**). La langue et le mode sombre sont aussi dans le menu de l'avatar.
- **Lecture** :
  - **Afficher les images distantes** : désactivé par défaut, car ces images servent souvent à savoir quand vous ouvrez un mail. Un bouton « Afficher » reste disponible dans chaque mail.
  - **Raccourcis clavier à une touche** : active les [raccourcis de Mails](mails.md#raccourcis-clavier) (`j`/`k`, `e`, `#`, `r`, `u`, `/`). À désactiver si vous utilisez une commande vocale.

---

## Sécurité

### Mot de passe

Comptes locaux uniquement (un compte Google ou SSO n'a pas de mot de passe Nid) : **Mot de passe actuel**, **Nouveau mot de passe** (8 caractères minimum) et sa confirmation, puis **Changer le mot de passe**. Vos autres sessions ouvertes sont déconnectées.

Mot de passe oublié : demandez à un administrateur de le réinitialiser ([Administration](admin.md#utilisateurs)).

### Authentification à deux facteurs (2FA)

1. Cliquez sur **Configurer la 2FA**
2. Scannez le QR code avec votre application d'authentification (Google Authenticator, Aegis, Authy…), ou saisissez la clé affichée
3. Saisissez le **Code à 6 chiffres** puis **Vérifier et activer**

Une fois activée, un code est demandé à chaque connexion, y compris avec Google ou un autre fournisseur (SSO). Pour la désactiver, saisissez un code puis **Désactiver la 2FA**.

### Liens de partage

Nombre de liens de partage actifs vers vos mails archivés, avec le lien **Gérer les liens de partage dans Archives** (onglet [Partages](archives.md#onglet-partages)).

---

## Comptes Gmail

Chaque compte connecté affiche :

- son état : **Synchronisé**, **Action requise** (Google a retiré l'accès de Nid : reconnectez le compte pour reprendre la synchronisation et les sauvegardes) ou **Déconnecté** ;
- **Synchronisation** : « Dernière synchro … », nombre de mails dans Gmail, bouton **Synchroniser maintenant** ;
- **Sauvegarde NAS** : **Sauvegarde automatique** (sauvegarde sur le NAS les nouveaux mails du compte) et sa **Fréquence** : Toutes les heures, Toutes les 6 heures, Une fois par jour ;
- **Reconnecter avec Google** et **Déconnecter**.

**Déconnecter** demande confirmation : Nid arrête la synchronisation et les sauvegardes de ce compte, mais ses archives restent sur le NAS et dans Nid. Les pages qui ont besoin de Gmail (Vue d'ensemble, Mails, Nettoyage, Règles) affichent alors « … est déconnecté » avec **Reconnecter dans Paramètres** ; [Archives](archives.md) reste consultable.

**Ajouter un compte Gmail** connecte un nouveau compte, dans la limite affichée (« N / max comptes »). Accès demandés : `gmail.modify`, `gmail.labels`.

---

## Notifications & webhooks

Préférences par événement (in-app, toast) et webhooks vers Discord, Slack, ntfy ou une URL à vous : voir [Notifications](notifications.md).

---

## Données

Les imports et l'export portent sur le compte Gmail actif.

### Importer un fichier mbox

Export Google Takeout ou autre client mail, ajouté aux archives du compte (libellés Gmail conservés). Cliquez sur **Choisir un fichier .mbox** ; l'import se suit dans [Activité](activity.md).

::: tip Google Takeout
1. Allez sur [takeout.google.com](https://takeout.google.com)
2. Sélectionnez uniquement **Gmail**, au format **mbox**
3. Téléchargez l'archive et importez le fichier `.mbox` dans Nid
:::

### Importer depuis un serveur IMAP

Copie les mails d'une autre boîte (Outlook, Fastmail…) dans les archives du compte. Champs : **Serveur**, **Port**, **Identifiant**, **Mot de passe**, **Dossier**, **Nombre maximal de mails**, **Connexion chiffrée (TLS)**, puis **Lancer l'import**. Le mot de passe n'est pas conservé.

::: warning Mot de passe d'application
De nombreux fournisseurs (Google, Outlook, Yahoo) exigent un **mot de passe d'application** plutôt que votre mot de passe habituel.
:::

### Exporter les archives

**Exporter (.mbox)** : toutes les archives du compte dans un fichier .mbox, lisible par Thunderbird ou Apple Mail.

### Configuration

Vos règles et webhooks dans un fichier JSON, pour les sauvegarder ou les reprendre sur une autre instance : **Exporter la configuration** / **Importer une configuration**.

### Mes données (RGPD)

**Exporter mes données** : tout ce que Nid conserve sur vous dans un fichier JSON (profil, comptes Gmail, règles, métadonnées des archives, journal d'activité…). Le contenu des mails s'exporte en .mbox (ci-dessus) ; les secrets (mots de passe, jetons) sont exclus.

### Supprimer mon compte

Saisissez votre mot de passe (ou, pour un compte Google/SSO, votre adresse e-mail), puis **Supprimer définitivement mon compte** et confirmez. Votre compte, vos comptes Gmail connectés, vos archives et vos règles sont supprimés de Nid ; rien n'est supprimé dans Gmail. Le dernier administrateur de l'instance ne peut pas supprimer son compte.
