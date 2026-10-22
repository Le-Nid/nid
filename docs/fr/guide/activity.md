# Activité

La page **Activité** (`/activity`) liste « tout ce que vous et vos règles avez lancé, en direct » : actions de masse, sauvegardes NAS, règles, analyses, imports, purges… Elle remplace l'ancienne page « Suivi des jobs ».

Sur ordinateur, la barre latérale affiche « N en cours » à côté d'**Activité** ; sur mobile, la page est dans **Plus › Outils**.

---

## Filtres

- **Compte Gmail** : un compte ou **Tous les comptes**. Les tâches propres à l'instance (sans compte) sont marquées **Instance**.
- **Statut**, en puces avec compteur : **Toutes**, **En attente**, **En cours**, **Échouées**, **Terminées**.

Les filtres sont gardés dans l'adresse de la page.

---

## Liste des tâches

| Colonne | Contenu |
|---|---|
| **Statut** | En attente, Planifié, En cours, Terminé, Échoué, Annulé |
| **Tâche** | type de tâche, compte, et origine : « Règle », « Nettoyage › expéditeur », « Mails › requête » ou « Relance » |
| **Progression / résultat** | barre de progression en direct, « Terminé · N mails traités », message d'erreur, « Arrêté »… |
| **Durée** | durée d'exécution |

« En attente » regroupe les tâches qui patientent dans la file et celles qui attendent la fin de leur délai d'annulation (10 s après une suppression, par exemple).

Le pied indique « N sur M · historique conservé 30 jours » ; **Afficher plus** charge la suite.

---

## Actions selon le statut

| Statut | Action |
|---|---|
| En attente | **Annuler** : la tâche ne s'exécutera pas |
| En cours | **Arrêter**, dans la barre de progression |
| Échouée | **Relancer** et **Détails** (date de lancement et message d'erreur) |
| Terminée | **Voir** : ouvre la page concernée (Mails, Règles, Nettoyage, Archives…), sinon **Détails** |

Une tâche d'import IMAP ne peut pas être relancée d'ici, car le mot de passe n'est pas conservé : « Cette tâche demande des identifiants non conservés : relancez-la depuis sa page. »

---

## Ailleurs dans l'application

La progression d'une tâche s'affiche aussi là où elle a été lancée (ligne d'expéditeur dans Nettoyage, en-tête d'Archives, liste de Mails), et la [Vue d'ensemble](overview.md) liste les jobs en cours. À la fin d'une tâche, une [notification](notifications.md) peut être envoyée selon vos préférences.
