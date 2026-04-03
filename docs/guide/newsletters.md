# Newsletters et désabonnement

Nid vous aide à identifier les newsletters et listes de diffusion auxquelles vous êtes abonné, puis à les nettoyer en masse.

---

## Scanner les newsletters

1. Ouvrez la page **Newsletters** dans la sidebar
2. Cliquez sur **Scanner** sur le compte Gmail de votre choix
3. Un job de scan est lancé — il analyse les headers `List-Unsubscribe` de vos mails récents

> 📸 *Capture d'écran suggérée : page Newsletters avant le scan, avec le bouton Scanner*

---

## Liste des newsletters détectées

Après le scan, Nid affiche la liste de toutes les newsletters détectées, avec pour chacune :

- **Expéditeur** : l'adresse d'envoi de la newsletter
- **Nombre de mails** : combien de mails vous avez reçus de cet expéditeur
- **Taille totale** : l'espace occupé par ces mails

La liste est triée par nombre de mails décroissant, ce qui met en avant les newsletters les plus envahissantes.

> 📸 *Capture d'écran suggérée : liste des newsletters détectées avec les colonnes expéditeur, nombre de mails et taille*

---

## Voir les mails d'une newsletter

Cliquez sur un expéditeur pour voir la liste de tous les mails reçus de cette newsletter. Vous pouvez ainsi vérifier le contenu avant de décider de nettoyer.

---

## Nettoyer les newsletters

Pour chaque newsletter, deux options de suppression sont disponibles :

### Envoyer à la corbeille

Déplace tous les mails de cet expéditeur vers la corbeille Gmail. Les mails sont récupérables pendant 30 jours.

### Supprimer définitivement

Supprime définitivement tous les mails de cet expéditeur. Cette action est **irréversible**.

> 📸 *Capture d'écran suggérée : boutons d'action sur une newsletter (Corbeille / Supprimer définitivement)*

!!! tip "Se désabonner aussi chez l'expéditeur"
    Nid détecte les newsletters mais ne gère pas le désabonnement auprès de l'expéditeur lui-même. Ouvrez le dernier mail de la newsletter et cliquez sur le lien de désabonnement en bas du mail pour ne plus recevoir de nouveaux mails.

---

## Bonnes pratiques

1. **Scannez régulièrement** pour détecter les nouvelles newsletters
2. **Commencez par la corbeille** plutôt que la suppression définitive
3. Combinez avec une **règle automatique** pour supprimer automatiquement les prochains mails d'une newsletter (voir [Règles](rules.md))
