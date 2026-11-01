# Paramètres

Les **Paramètres** (`/settings/…`) sont découpés en cinq sections, en onglets sur ordinateur et listées dans la page **Plus** sur mobile :

| Section | Adresse |
|---|---|
| [Compte](#compte) | `/settings/account` |
| [Sécurité](#securite) | `/settings/security` |
| [Comptes Gmail](#comptes-gmail) | `/settings/gmail` |
| [Notifications & webhooks](#notifications-webhooks) | `/settings/notifications` |
| [Données](#donnees) | `/settings/data` |
| [À propos](#a-propos) | `/settings/about` |

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

Mot de passe oublié : sur l'écran de connexion, **Mot de passe oublié ?** envoie un lien valable 1 heure (si l'instance a un serveur SMTP, voir [Configuration](../installation/configuration.md#e-mail-smtp)). Sinon, demandez à un administrateur de le réinitialiser ([Administration](admin.md#utilisateurs)).

### Passkeys

Une passkey remplace mot de passe et code 2FA : on se connecte avec le code ou la biométrie de l'appareil (Face ID, Windows Hello, empreinte, clé de sécurité). Donnez-lui un **Nom** (ex. « iPhone »), puis **Ajouter une passkey** et suivez la fenêtre du navigateur. Ensuite, sur l'écran de connexion : **Se connecter avec une passkey**, sans saisir d'e-mail. La liste indique la dernière utilisation de chaque passkey ; l'icône corbeille la supprime.

La carte n'apparaît que si le navigateur gère les passkeys. Une passkey est liée à l'adresse de l'instance : si cette adresse change, il faut en recréer.

### Authentification à deux facteurs (2FA)

1. Cliquez sur **Configurer la 2FA**
2. Scannez le QR code avec votre application d'authentification (Google Authenticator, Aegis, Authy…), ou saisissez la clé affichée
3. Saisissez le **Code à 6 chiffres** puis **Vérifier et activer**

Une fois activée, un code est demandé à chaque connexion, y compris avec Google ou un autre fournisseur (SSO). Pour la désactiver, saisissez un code puis **Désactiver la 2FA**.

### Jetons d'API

Pour Home Assistant ou un script. Donnez un **Nom** au jeton, choisissez ses **Droits** (*Lecture seule*, ou *Lecture et actions* pour lancer des jobs ou des règles) et son **Expiration**, puis **Créer le jeton**. Copiez-le tout de suite : il n'est affiché qu'une fois. Envoyez-le dans l'en-tête `Authorization: Bearer nid_…`. Un jeton n'a jamais accès à la sécurité du compte, à l'administration, au chiffrement, aux webhooks ni aux liens de partage. La liste indique la dernière utilisation de chaque jeton ; l'icône corbeille le révoque. Voir la [référence API](../technical/api/auth.md#jetons-d-api).

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

Au retour de Google, un assistant **Configurer le compte** s'ouvre pour ce nouveau compte (pas lors d'une reconnexion) :

1. **Connexion Google** — déjà faite ;
2. **Sauvegarde** — sauvegarde automatique et fréquence, puis la **première sauvegarde** : les 12 derniers mois (par défaut), toute la boîte, ou plus tard ;
3. **Règles** — des règles de départ à cocher (nettoyage des promotions, des vieilles newsletters, archivage des factures…), chacune avec son action, sa fréquence et le nombre approximatif de mails concernés aujourd'hui ;
4. **Récapitulatif** — **Terminer** applique tout. « Supprimer » place les mails dans la corbeille Gmail (30 jours).

Chaque étape peut être passée ; **Plus tard** ferme l'assistant sans rien enregistrer. Les règles créées se modifient ensuite dans [Règles & libellés](rules.md).

**Ajouter un compte IMAP** connecte un compte d'un autre fournisseur (OVH, Infomaniak, Fastmail, Outlook…) en **archivage seul** : adresse, serveur IMAP, port (993 par défaut), connexion chiffrée, identifiant (l'adresse par défaut) et mot de passe — avec la double authentification, un mot de passe d'application. Dès l'adresse saisie, Nid cherche le serveur, le port et le chiffrement (base de Thunderbird, puis le domaine de l'adresse, sinon `imap.<domaine>`) et préremplit le formulaire, avec « Serveur trouvé automatiquement » ou « Serveur supposé d'après le domaine : vérifiez-le » ; un serveur saisi à la main n'est jamais remplacé. Nid teste la connexion avant d'enregistrer et affiche la raison donnée par le serveur s'il refuse. Le mot de passe est stocké chiffré. Le même assistant s'ouvre ensuite (sauvegarde automatique, première sauvegarde : toute la boîte ou plus tard ; pas de règles, réservées à Gmail).

Un compte IMAP porte le badge **IMAP · archivage**. Ses dossiers sont sauvegardés sur le NAS et deviennent des libellés dans [Archives](archives.md) ; la Vue d'ensemble n'affiche que ses chiffres d'archives, et Mails, Nettoyage et Règles renvoient vers Archives. Si le serveur refuse la connexion (mot de passe changé), le compte passe en **Action requise** : **Mettre à jour le serveur ou le mot de passe**.

**Dossiers et période** choisit ce que la sauvegarde d'un compte IMAP copie : **Tous les dossiers** (sauf indésirables, corbeille et « Tous les messages », par défaut) ou **Seulement ces dossiers** (cases à cocher, lues sur le serveur), et **Mails reçus depuis le** (vide : toute la boîte). Le choix s'applique à la sauvegarde suivante ; les mails déjà archivés restent dans les archives. Changer la date relit chaque dossier depuis le début (les mails déjà archivés sont ignorés).

### Partager un compte en lecture seule

Le bloc **Partage** de chaque compte donne accès à ses archives à d'autres utilisateurs de **cette instance Nid** : saisissez l'adresse de leur compte Nid puis **Partager**. Ils peuvent rechercher et lire les archives (pièces jointes, conversations, contacts, libellés et tags), **sans rien modifier** ni accéder à Gmail : pas de suppression, de tags, de restauration, d'export, de lien de partage, ni de sauvegarde. Le bouton ✕ d'une personne lui retire l'accès.

Pour celui qui reçoit le partage, le compte apparaît dans le sélecteur de compte avec « (partagé par …) » : [Archives](archives.md) s'ouvre en lecture seule (onglets Mails et Contacts) et les autres pages indiquent que seules ses archives sont accessibles. La carte **Partagés avec moi** liste ces comptes ; **Ne plus voir** retire le partage de son côté.


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

### Importer des fichiers .eml

Un ou plusieurs mails enregistrés depuis un client mail (Thunderbird, Outlook, Apple Mail…). **Choisir ou déposer des fichiers .eml** (ou glissez les fichiers sur le bouton) : ils sont archivés tout de suite et un message donne le nombre de mails importés, ignorés (déjà archivés) et en erreur (fichier qui n'est pas un mail, plus de 50 Mo).

### Importer depuis un serveur IMAP

Copie les mails d'une autre boîte (Outlook, Fastmail…) dans les archives du compte. Champs : **Serveur**, **Port**, **Identifiant**, **Mot de passe**, **Dossier**, **Nombre maximal de mails**, **Connexion chiffrée (TLS)**, puis **Lancer l'import**. Le mot de passe n'est pas conservé.

::: warning Mot de passe d'application
De nombreux fournisseurs (Google, Outlook, Yahoo) exigent un **mot de passe d'application** plutôt que votre mot de passe habituel.
:::

### Exporter les archives

**Exporter (.mbox)** : toutes les archives du compte dans un fichier .mbox, lisible par Thunderbird ou Apple Mail.

### Archives chiffrées

Affichée seulement si le compte a encore des archives chiffrées par l'ancien chiffrement, retiré de Nid : il laissait en clair objet, expéditeur et destinataires, et empêchait la lecture, la recherche et la restauration. Saisissez la **Phrase secrète** puis **Déchiffrer** : les archives sont remises en clair en tâche de fond (suivi dans [Activité](activity.md)), puis redeviennent lisibles et cherchables. Pour protéger les archives au repos, chiffrez plutôt le volume du NAS.

### Configuration

Vos règles et webhooks dans un fichier JSON, pour les sauvegarder ou les reprendre sur une autre instance : **Exporter la configuration** / **Importer une configuration**.

### Mes données (RGPD)

**Exporter mes données** : tout ce que Nid conserve sur vous dans un fichier JSON (profil, comptes Gmail, règles, métadonnées des archives, journal d'activité…). Le contenu des mails s'exporte en .mbox (ci-dessus) ; les secrets (mots de passe, jetons) sont exclus.

### Supprimer mon compte

Saisissez votre mot de passe (ou, pour un compte Google/SSO, votre adresse e-mail), puis **Supprimer définitivement mon compte** et confirmez. Votre compte, vos comptes Gmail connectés, vos archives et vos règles sont supprimés de Nid ; rien n'est supprimé dans Gmail. Le dernier administrateur de l'instance ne peut pas supprimer son compte.

---

## À propos

- **Version** : la version de Nid installée, et si une plus récente est publiée (vérification deux fois par jour, avec la date de la dernière). Quand une mise à jour existe, la carte donne le lien vers les nouveautés et la commande à lancer.
- **Ce que Nid contacte** : la liste des services externes auxquels l'instance parle (Google, ghcr.io pour la vérification des versions, votre SMTP, vos webhooks, les fournisseurs SSO configurés). Aucune télémétrie.
- **Projet** : licence MIT, code source, historique des versions, signalement d'un problème.
