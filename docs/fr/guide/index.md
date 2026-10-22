# Guide utilisateur

Nid gère et archive vos boîtes Gmail depuis votre propre serveur (NAS, serveur maison). Ce guide suit l'organisation de l'application : une page par écran.

---

## Les écrans

| Écran | Adresse | À quoi il sert |
|---|---|---|
| [**Vue d'ensemble**](overview.md) | `/overview` | État du compte, top encombreurs, suggestions, jobs en cours |
| [**Mails**](mails.md) | `/mails` | Rechercher, sélectionner et traiter vos mails en masse, avec annulation |
| [**Nettoyage**](cleanup.md) | `/cleanup` | Expéditeurs & newsletters, gros mails & pièces jointes |
| [**Règles & libellés**](rules.md) | `/rules` | Règles automatiques, libellés Gmail, modèles |
| [**Archives**](archives.md) | `/archives` | Copie locale sur le NAS : recherche, lecteur, partage, corbeille, rétention |
| [**Activité**](activity.md) | `/activity` | Toutes les tâches lancées, en direct |
| [**Paramètres**](settings.md) | `/settings/…` | Compte, Sécurité, Comptes Gmail, Notifications & webhooks, Données |
| [**Pièces jointes**](attachments.md) | `/attachments` | Liste complète des pièces jointes (depuis la palette ⌘K) |
| [**Notifications**](notifications.md) | cloche + Paramètres | Notifications in-app, toasts, webhooks |
| [**Administration**](admin.md) | `/admin` | Utilisateurs, réglages de l'instance, audit (admins) |
| [**Serveur MCP**](mcp-server.md) | — | Piloter Nid depuis un assistant IA |

Nouveau sur Nid ? Commencez par les [**Premiers pas**](first-steps.md).

---

## Se repérer dans l'interface

### Sur ordinateur

- **Barre latérale** à gauche : logo, bouton **Réduire la barre latérale** (`Ctrl+B` / `⌘B`), sélecteur **Compte Gmail**, bouton **Rechercher…**, puis les entrées Vue d'ensemble, Mails, Nettoyage, Règles & libellés, Archives, Activité, Paramètres. Les administrateurs ont en plus un groupe **Administration** avec **Admin**.
- **Compteurs** à côté des entrées : nombre de mails du compte (Mails), nombre de règles actives (Règles & libellés), « N en cours » (Activité).
- **En-tête** : cloche des [notifications](notifications.md) et menu utilisateur (avatar) : **Langue**, **Mode sombre**, **Se déconnecter**.

### Sur mobile

L'en-tête garde la cloche et l'avatar ; le menu de l'avatar contient en plus le choix du **Compte Gmail**. Une barre en bas d'écran donne accès à **Accueil** (Vue d'ensemble), **Mails**, **Nettoyage**, **Archives** et **Plus**.

La page **Plus** regroupe le reste :

- **Outils** : Règles & libellés, Activité (avec le nombre de tâches en cours) ;
- **Paramètres** : les cinq sections, chacune avec un résumé (« 2FA activée », « 1 action requise », « Import, export »…) ;
- **Administration** (admins uniquement) : « Admin de l'instance » ;
- en bas : « Connecté(e) en tant que … » et **Se déconnecter de Nid**.

### Palette de commandes

`⌘K` (Mac) ou `Ctrl+K` ouvre la palette « Aller à… » : toutes les pages de la navigation, l'action **Nouvelle règle**, et sous **Autres pages** la page [Pièces jointes](attachments.md).

### Anciennes adresses

Les anciennes pages redirigent vers leur nouvel emplacement : `/dashboard`, `/analytics`, `/insights` → Vue d'ensemble ; `/unified` → Mails, « Tous les comptes » ; `/saved-searches` → Mails ; `/unsubscribe` → Nettoyage ; `/expiration` → Règles & libellés, onglet Libellés ; `/archive` → Archives ; `/sharing` → Archives, onglet Partages ; `/jobs` → Activité ; `/privacy` → Paramètres › Compte ; `/ops` → Paramètres › Données.
