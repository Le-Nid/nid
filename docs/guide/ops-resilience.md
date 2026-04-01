# Ops & Résilience

Gmail Manager offre des outils d'opérations et de résilience pour gérer le stockage, la rétention des archives, le suivi des quotas Gmail API, et l'import/export de mails.

---

## Accéder à la page

Dans la barre latérale, ouvrez le groupe **Système** et cliquez sur **Ops & Résilience**.

La page est organisée en 4 onglets :

| Onglet | Fonctionnalité |
|---|---|
| **Stockage S3** | Configuration du stockage distant (S3, MinIO, Backblaze B2) |
| **Rétention** | Politiques de suppression automatique des archives anciennes |
| **Quota API** | Suivi en temps réel de la consommation du quota Gmail API |
| **Import / Export** | Import mbox et IMAP, export mbox |

---

## Stockage distant (S3 / MinIO)

Par défaut, Gmail Manager stocke les archives EML sur le système de fichiers local (NAS). Vous pouvez configurer un stockage S3-compatible pour :

- **Géo-répliquer** vos archives sur un cloud distant
- Utiliser des services comme **AWS S3**, **MinIO**, **Backblaze B2**, **Wasabi**, etc.
- Séparer le stockage de l'application

### Configurer le stockage S3

1. Dans l'onglet **Stockage S3**, sélectionnez le type **S3-compatible**
2. Renseignez les informations de connexion :
   - **Endpoint** : URL de votre serveur S3 (ex. `https://s3.amazonaws.com` ou `https://minio.local:9000`)
   - **Région** : région S3 (ex. `us-east-1`, `eu-west-1`)
   - **Bucket** : nom du bucket de stockage
   - **Access Key ID** et **Secret Access Key** : identifiants d'accès
   - **Path-style** : à activer pour MinIO (désactiver pour AWS S3)
3. Cliquez sur **Tester la connexion** pour vérifier que les identifiants sont corrects
4. Cliquez sur **Sauvegarder**

> 📸 *Capture d'écran suggérée : formulaire de configuration S3 avec les champs endpoint, région, bucket et les boutons tester/sauvegarder*

!!! tip "Configuration globale vs par utilisateur"
    Le stockage S3 peut être configuré de deux manières :

    - **Globalement** via les variables d'environnement (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, etc.) — tous les utilisateurs utilisent le même stockage
    - **Par utilisateur** via l'interface — chaque utilisateur peut configurer son propre stockage S3

    La configuration par utilisateur a priorité sur la configuration globale.

!!! info "MinIO"
    Pour utiliser MinIO (auto-hébergé), activez le **Path-style** et pointez l'endpoint vers votre instance MinIO (ex. `http://minio:9000`).

### Revenir au stockage local

Sélectionnez le type **Local (NAS / disque)** et sauvegardez.

---

## Politiques de rétention

Les politiques de rétention suppriment automatiquement les archives plus anciennes qu'une durée configurable. Cela permet de :

- Libérer de l'espace disque
- Se conformer à des politiques de conservation de données
- Nettoyer automatiquement les vieilles archives

### Créer une politique

1. Dans l'onglet **Rétention**, cliquez sur **Nouvelle politique**
2. Renseignez :
   - **Nom** : nom descriptif (ex. « Archives > 2 ans »)
   - **Compte** : optionnel — pour cibler un compte Gmail spécifique, ou tous
   - **Label** : optionnel — pour cibler uniquement les mails avec un label particulier
   - **Jours de rétention** : durée maximale en jours (ex. 365 pour 1 an, 730 pour 2 ans)
3. Cliquez sur **Créer**

> 📸 *Capture d'écran suggérée : formulaire de création de politique de rétention*

### Gérer les politiques

- **Activer / Désactiver** : utilisez le switch pour activer ou désactiver une politique sans la supprimer
- **Supprimer** : supprime définitivement la politique
- **Exécuter maintenant** : lance manuellement l'application de toutes les politiques actives

Le tableau affiche pour chaque politique :

| Colonne | Description |
|---|---|
| Nom | Nom de la politique |
| Compte | Compte Gmail ciblé (ou « Tous ») |
| Label | Label Gmail ciblé (ou « — ») |
| Durée max | Âge maximum des archives |
| Supprimés | Nombre total d'archives supprimées depuis la création |
| Dernière exécution | Date de la dernière application |
| Actif | État de la politique |

!!! warning "Suppression irréversible"
    Les archives supprimées par une politique de rétention sont définitivement effacées (fichier EML + entrée en base de données). Cette action est irréversible.

---

## Dashboard quota Gmail API

Google impose un quota de **250 unités par utilisateur par seconde** sur l'API Gmail. Chaque appel consomme un nombre d'unités variable (ex. `messages.get` = 5 unités, `messages.send` = 100 unités).

Le dashboard quota vous permet de :

- **Surveiller** votre consommation en temps réel
- **Identifier** les endpoints les plus consommateurs
- **Anticiper** les dépassements de quota

### Lecture du dashboard

L'onglet **Quota API** affiche :

| Bloc | Description |
|---|---|
| **Dernière minute** | Unités consommées + pourcentage du plafond (barre de progression colorée) |
| **Dernière heure** | Total d'unités et de requêtes sur l'heure écoulée |
| **24 dernières heures** | Total d'unités et de requêtes sur la journée |
| **Top endpoints** | Classement des endpoints les plus gourmands (24h) |
| **Historique horaire** | Tableau détaillé heure par heure (24h) |

> 📸 *Capture d'écran suggérée : dashboard quota avec les 3 statistiques en haut, le tableau des endpoints au milieu et l'historique horaire en bas*

!!! info "Rafraîchissement automatique"
    Les données du quota sont actualisées automatiquement **toutes les 30 secondes**.

### Coûts des endpoints Gmail API

| Endpoint | Unités |
|---|---|
| `messages.get` | 5 |
| `messages.list` | 5 |
| `messages.send` | 100 |
| `messages.modify` | 5 |
| `messages.trash` | 5 |
| `messages.delete` | 10 |
| `messages.batchModify` | 50 |
| `messages.batchDelete` | 50 |
| `labels.list` / `labels.get` | 1 |

---

## Import de mails

Gmail Manager permet d'importer des mails depuis des sources externes dans vos archives.

### Import Mbox

Le format **mbox** est un standard utilisé par Google Takeout, Thunderbird, Apple Mail et d'autres clients email. Il regroupe plusieurs mails dans un seul fichier.

1. Dans l'onglet **Import / Export**, section **Import Mbox**, déposez votre fichier `.mbox`
2. Un job d'import est créé — suivez sa progression dans la page **Jobs**
3. Chaque mail du fichier mbox est converti en EML individuel et ajouté à vos archives

Le processus :

- Parse chaque message du fichier mbox
- Extrait les métadonnées (sujet, expéditeur, date, pièces jointes)
- Vérifie les doublons (skip si le Message-ID existe déjà)
- Stocke le fichier EML + les pièces jointes séparément
- Indexe le mail dans PostgreSQL (recherche full-text)

> 📸 *Capture d'écran suggérée : zone de drag & drop pour le fichier mbox*

!!! tip "Google Takeout"
    Pour exporter vos mails depuis Gmail :

    1. Allez sur [takeout.google.com](https://takeout.google.com)
    2. Sélectionnez uniquement **Gmail**
    3. Choisissez le format **mbox**
    4. Téléchargez l'archive et importez le fichier `.mbox` dans Gmail Manager

### Import IMAP

Importez directement des mails depuis un serveur IMAP (Outlook, ProtonMail, Yahoo, etc.) :

1. Dans la section **Import IMAP**, renseignez :
   - **Serveur IMAP** : adresse du serveur (ex. `imap.outlook.com`)
   - **Port** : port du serveur (défaut : 993)
   - **Identifiant** : votre login email
   - **Mot de passe** : votre mot de passe ou mot de passe d'application
   - **Dossier** : dossier IMAP à importer (défaut : `INBOX`)
   - **Max messages** : optionnel — limiter le nombre de mails importés
   - **Connexion sécurisée** : TLS activé par défaut
2. Cliquez sur **Lancer l'import**
3. Un job est créé — suivez sa progression dans la page **Jobs**

> 📸 *Capture d'écran suggérée : formulaire d'import IMAP avec les champs serveur, port, identifiant et mot de passe*

!!! warning "Mot de passe d'application"
    De nombreux providers (Google, Outlook, Yahoo) nécessitent un **mot de passe d'application** spécifique plutôt que votre mot de passe habituel. Consultez la documentation de votre fournisseur email.

!!! info "Serveurs IMAP courants"
    | Provider | Serveur | Port |
    |---|---|---|
    | Outlook / Hotmail | `imap-mail.outlook.com` | 993 |
    | Yahoo | `imap.mail.yahoo.com` | 993 |
    | ProtonMail (Bridge) | `127.0.0.1` | 1143 |
    | OVH | `ssl0.ovh.net` | 993 |
    | Free | `imap.free.fr` | 993 |

---

## Export Mbox

Exportez vos archives au format mbox, compatible avec la plupart des clients email :

1. Dans la section **Export Mbox**, cliquez sur **Exporter en .mbox**
2. Le fichier est généré et téléchargé automatiquement

Le fichier mbox contient tous vos mails archivés du compte sélectionné, au format standard RFC 4155.

!!! tip "Réimportation"
    Le fichier mbox exporté peut être importé dans Thunderbird, Apple Mail ou toute autre application compatible. C'est un bon moyen de sauvegarder vos archives dans un format universel.
