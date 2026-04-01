# Suivi des jobs

Toutes les opérations longues dans Gmail Manager (suppression en masse, archivage, scan de newsletters, etc.) sont exécutées en arrière-plan via des **jobs**. La page Jobs vous permet de suivre leur progression.

---

## Liste des jobs

La page **Jobs** affiche tous vos jobs avec leur statut actuel :

| Statut | Signification |
|---|---|
| 🟡 **En attente** | Le job est dans la queue, pas encore démarré |
| 🔵 **En cours** | Le job est en cours d'exécution |
| 🟢 **Terminé** | Le job s'est terminé avec succès |
| 🔴 **En erreur** | Le job a échoué (3 tentatives automatiques épuisées) |
| ⚪ **Annulé** | Le job a été annulé manuellement |

> 📸 *Capture d'écran suggérée : page Jobs avec plusieurs jobs dans différents statuts*

---

## Types de jobs

| Type | Déclenché par |
|---|---|
| **Opération groupée** | Actions en masse dans Mes mails (supprimer, labelliser, etc.) |
| **Archivage** | Archivage sur NAS depuis Mes mails |
| **Exécution de règle** | Lancement manuel ou planifié d'une règle |
| **Scan newsletters** | Scan de la page Newsletters |
| **Scan pixels espions** | Scan depuis la page Vie privée |
| **Scan PII** | Scan de données sensibles depuis Vie privée |
| **Chiffrement archives** | Chiffrement depuis Vie privée |

---

## Suivi en temps réel

Quand un job est lancé, une **modale de progression** s'affiche automatiquement :

- Barre de progression (ex. : 42/150 mails traités)
- Pourcentage de completion
- Statut en temps réel

> 📸 *Capture d'écran suggérée : modale de progression d'un job avec barre de progression*

La mise à jour est instantanée grâce aux **Server-Sent Events** (SSE) — pas besoin de rafraîchir la page.

Vous pouvez fermer la modale sans interrompre le job. Il continue en arrière-plan.

---

## Annuler un job

Pour annuler un job en attente ou en cours :

1. Cliquez sur le bouton **Annuler** à côté du job
2. Le job passe au statut **Annulé**

!!! warning "Annulation partielle"
    Les mails déjà traités avant l'annulation ne sont pas restaurés. Par exemple, si 50 mails sur 100 ont été supprimés quand vous annulez, les 50 premiers restent supprimés.

---

## Détail d'un job

Cliquez sur un job pour voir ses détails :

- Type d'opération
- Compte Gmail concerné
- Nombre de mails traités / total
- Date de création et de fin
- Message d'erreur (en cas d'échec)

---

## Retry automatique

En cas d'erreur (ex. : timeout Gmail API), les jobs sont automatiquement relancés jusqu'à **3 fois** avec un délai exponentiel :

- 1ère tentative : immédiate
- 2ème tentative : après 2 secondes
- 3ème tentative : après 4 secondes
- Après 3 échecs : le job passe en statut **En erreur**

---

## Notifications de fin de job

Quand un job se termine (succès ou échec), vous recevez une notification :

- **In-app** : dans la cloche de notifications (🔔)
- **Toast** : pop-up temporaire en bas de page (si activé dans les [préférences](notifications.md))
- **Webhook** : push vers Discord, Slack, etc. (si [configuré](notifications.md#webhooks))
