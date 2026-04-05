# Notifications et webhooks

Nid vous informe des événements importants via des notifications in-app et des webhooks vers vos services préférés.

---

## Notifications in-app

### Cloche de notifications

L'icône **🔔** dans la barre de navigation affiche vos notifications. Le badge rouge indique le nombre de notifications non lues.

> 📸 *Capture d'écran suggérée : cloche de notifications avec badge et panneau déroulant montrant les notifications*

### Actions sur les notifications

- Cliquez sur une notification pour la marquer comme lue
- **Tout marquer comme lu** : marque toutes les notifications comme lues
- **Supprimer** : supprime une notification individuellement
- **Supprimer les lues** : supprime toutes les notifications déjà lues

### Types de notifications

| Notification | Description |
|---|---|
| **Rapport hebdomadaire** | Résumé de votre activité email de la semaine |
| **Job terminé** | Un job (archivage, suppression, etc.) s'est terminé avec succès |
| **Job en échec** | Un job a échoué après 3 tentatives |
| **Règle exécutée** | Une règle automatique a été exécutée |
| **Alerte quota** | Votre quota de stockage approche de la limite |
| **Alerte intégrité** | La vérification d'intégrité des archives a détecté un problème |

---

## Préférences de notifications

Personnalisez les canaux de notification pour chaque type d'événement.

1. Rendez-vous dans **Paramètres** → section **Préférences de notifications**
2. Pour chaque type de notification, activez ou désactivez les canaux :

| Canal | Description |
|---|---|
| 🔔 **In-app** | Crée une notification dans la cloche du header |
| 💬 **Toast** | Affiche une pop-up temporaire en bas de page |

> 📸 *Capture d'écran suggérée : tableau des préférences de notifications avec les toggles in-app et toast pour chaque type*

Chaque toggle prend effet **immédiatement** — pas besoin de sauvegarder.

---

## Webhooks

Les webhooks permettent d'envoyer des notifications vers des services externes quand un événement se produit dans Nid.

### Types supportés

| Type | Description |
|---|---|
| **Discord** | Message dans un salon Discord via webhook URL |
| **Slack** | Message dans un channel Slack via Incoming Webhook |
| **Ntfy** | Notification push via [ntfy.sh](https://ntfy.sh) |
| **Générique** | Requête HTTP POST vers n'importe quelle URL |

### Événements disponibles

| Événement | Description |
|---|---|
| `job.completed` | Un job s'est terminé avec succès |
| `job.failed` | Un job a échoué |
| `rule.executed` | Une règle automatique a été exécutée |
| `quota.warning` | Le quota de stockage est presque atteint |
| `integrity.failed` | La vérification d'intégrité a détecté un problème |

### Configurer un webhook

1. Dans **Paramètres** → section **Webhooks**
2. Cliquez sur **Ajouter un webhook**
3. Renseignez :
    - **Nom** : un identifiant libre (ex. : "Notif Discord")
    - **URL** : l'URL du webhook de votre service
    - **Type** : Discord, Slack, Ntfy ou Générique
    - **Événements** : cochez les événements qui déclenchent le webhook
    - **Utilisateur / Mot de passe** *(Ntfy uniquement)* : identifiants si le topic est protégé par authentification

> 📸 *Capture d'écran suggérée : formulaire de création d'un webhook avec les champs nom, URL, type et événements*

### Tester un webhook

Cliquez sur **Tester** à côté d'un webhook pour envoyer un message test et vérifier que la connexion fonctionne.

### Activer / désactiver

Le toggle à côté de chaque webhook permet de l'activer ou le désactiver sans le supprimer.

### Sécurité (webhooks génériques)

Les webhooks de type **Générique** incluent automatiquement un header `X-Webhook-Signature` contenant un HMAC-SHA256 du payload. Votre serveur peut vérifier cette signature pour s'assurer que la requête provient bien de Nid.

> 📸 *Capture d'écran suggérée : liste des webhooks configurés avec les colonnes nom, type, événements, toggle actif/inactif et bouton tester*

---

## Exemples d'utilisation

### Discord

1. Dans Discord, créez un webhook dans un salon : **Paramètres du salon** → **Intégrations** → **Webhooks** → **Nouveau webhook**
2. Copiez l'URL du webhook
3. Dans Nid, créez un webhook de type **Discord** avec cette URL
4. Sélectionnez les événements à notifier

### Ntfy

[ntfy](https://ntfy.sh) permet de recevoir des notifications push sur votre téléphone ou navigateur.

#### Topic public (sans authentification)

1. Choisissez un topic sur [ntfy.sh](https://ntfy.sh) (ex. : `nid-alerts`)
2. Dans Nid, créez un webhook de type **Ntfy** avec l'URL `https://ntfy.sh/nid-alerts`
3. Installez l'app ntfy sur votre téléphone et abonnez-vous au même topic

#### Topic protégé (avec login / mot de passe)

Si vous hébergez votre propre serveur ntfy ou utilisez un topic protégé par mot de passe :

1. Dans Nid, créez un webhook de type **Ntfy** avec l'URL de votre serveur (ex. : `https://ntfy.example.com/mon-topic`)
2. Renseignez le **nom d'utilisateur** et le **mot de passe** dans les champs qui apparaissent quand le type Ntfy est sélectionné
3. Les identifiants sont envoyés via l'en-tête HTTP `Authorization: Basic` (encodage Base64)
4. Cliquez sur **Tester** pour vérifier que l'authentification fonctionne

!!! tip "Serveur ntfy auto-hébergé"
    Si vous utilisez un serveur ntfy auto-hébergé avec contrôle d'accès (`auth-default-access: deny-all`), vous devez créer un utilisateur et lui autoriser l'accès en écriture au topic :
    ```bash
    ntfy user add monuser
    ntfy access monuser mon-topic write
    ```

!!! warning "Sécurité"
    Les identifiants ntfy sont stockés en clair dans la base de données. Utilisez un compte dédié avec des permissions minimales (écriture seule sur le topic concerné).
