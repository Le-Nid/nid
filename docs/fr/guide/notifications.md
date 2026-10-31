# Notifications et webhooks

Nid vous prévient des événements importants de trois façons : la **cloche** de l'en-tête, des **toasts** (messages temporaires à l'écran) et des **webhooks** vers vos services. Les réglages sont dans **Paramètres › Notifications & webhooks**.

---

## Cloche de notifications

La cloche, en haut à droite de chaque page, affiche le nombre de notifications non lues. Elle ouvre un panneau avec les dernières notifications :

- cliquer une notification la marque comme lue ;
- **Tout marquer lu** ;
- **Supprimer lues** : après confirmation, supprime définitivement les notifications lues ;
- le bouton de suppression d'une ligne supprime cette notification.

---

## Préférences de notification

Dans **Paramètres › Notifications & webhooks**, chaque événement a deux interrupteurs : **In-app** (dans la cloche) et **Toast** (message temporaire à l'écran). Chaque changement est enregistré immédiatement.

| Événement | Quand |
|---|---|
| **Rapport hebdomadaire** | résumé d'activité chaque lundi |
| **Tâche terminée** | une tâche (action de masse, sauvegarde, règle) se termine |
| **Tâche en échec** | une tâche échoue |
| **Règle exécutée** | une règle automatique s'exécute |
| **Alerte de stockage** | le stockage des archives approche sa limite |
| **Alerte d'intégrité** | un problème est détecté dans les archives |

---

## Webhooks

« Envoie les événements vers Discord, Slack, ntfy ou une URL à vous (signée HMAC). »

### Créer un webhook

**Nouveau webhook** ouvre le formulaire :

- **Nom** ;
- **URL** ;
- **Type** : **Générique (HMAC)**, **Discord**, **Slack**, **ntfy** ;
- pour ntfy : **Utilisateur ntfy (facultatif)** et **Mot de passe ntfy (facultatif)** ;
- **Événements** (au moins un) :

| Événement | Préférence correspondante |
|---|---|
| `job.completed` | Tâche terminée |
| `job.failed` | Tâche en échec |
| `rule.executed` | Règle exécutée |
| `quota.warning` | Alerte de stockage |
| `integrity.failed` | Alerte d'intégrité |
| `account.reauth_required` | Compte Gmail à reconnecter |

Le rapport hebdomadaire n'est pas envoyé par webhook.

### Gérer les webhooks

Chaque webhook de la liste affiche son type et le code du dernier envoi (« dernier envoi : 200 »). Un interrupteur l'active ou le désactive sans le supprimer. Son menu propose **Envoyer un test** et **Supprimer** (après confirmation).

### Signature (type Générique)

Les webhooks de type **Générique (HMAC)** ajoutent un en-tête `X-Webhook-Signature: sha256=…`, HMAC-SHA256 du corps de la requête. Votre serveur peut le vérifier pour s'assurer que la requête vient bien de Nid.

---

## Exemples

### Discord

1. Dans Discord : **Paramètres du salon** → **Intégrations** → **Webhooks** → **Nouveau webhook**, puis copiez l'URL
2. Dans Nid, créez un webhook de type **Discord** avec cette URL et choisissez les événements

### ntfy

[ntfy](https://ntfy.sh) envoie des notifications push sur votre téléphone ou navigateur.

- **Topic public** : créez un webhook de type **ntfy** avec l'URL `https://ntfy.sh/nid-alerts`, puis abonnez-vous au même topic dans l'app ntfy.
- **Topic protégé** (serveur ntfy auto-hébergé, par exemple) : renseignez l'URL de votre serveur (`https://ntfy.example.com/mon-topic`) et les champs utilisateur / mot de passe ; ils sont envoyés en `Authorization: Basic`. **Envoyer un test** vérifie l'authentification.

::: tip Serveur ntfy auto-hébergé
Avec un contrôle d'accès (`auth-default-access: deny-all`), créez un utilisateur et autorisez-le en écriture sur le topic :
```bash
ntfy user add monuser
ntfy access monuser mon-topic write
```
:::

::: warning Sécurité
Les identifiants ntfy sont stockés en clair dans la base de données. Utilisez un compte dédié avec des permissions minimales (écriture seule sur le topic concerné).
:::

Pour Home Assistant, voir le guide dédié : [Home Assistant](home-assistant.md).
