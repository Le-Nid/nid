# Gestion des mails

La page **Mes mails** est le cœur de Gmail Manager. Elle vous permet de consulter, filtrer et agir en masse sur les mails de votre boîte Gmail.

---

## Consultation des mails

La page affiche la liste de vos mails Gmail avec les informations essentielles : expéditeur, objet, date, taille, labels et indicateur de pièces jointes.

> 📸 *Capture d'écran suggérée : page Mes mails avec la liste des mails, les filtres et la barre d'actions*

### Recherche

Utilisez la barre de recherche en haut de la page. Elle supporte la **syntaxe native Gmail** :

| Exemple | Description |
|---|---|
| `from:amazon.fr` | Mails de Amazon |
| `subject:facture` | Mails contenant "facture" dans l'objet |
| `has:attachment larger:5M` | Mails avec PJ de plus de 5 Mo |
| `older_than:1y` | Mails de plus d'un an |
| `is:unread from:newsletter` | Newsletters non lues |
| `label:promotions` | Mails dans le label Promotions |

> 📸 *Capture d'écran suggérée : barre de recherche Gmail avec suggestions*

### Lecture d'un mail

Cliquez sur un mail pour l'ouvrir dans le **lecteur intégré**. Le lecteur affiche :

- Le corps du mail (HTML ou texte brut)
- Les pièces jointes avec possibilité de téléchargement
- Les métadonnées (expéditeur, destinataires, date, taille)

> 📸 *Capture d'écran suggérée : lecteur de mail ouvert avec un mail HTML et des pièces jointes*

---

## Actions en masse (bulk)

Sélectionnez un ou plusieurs mails (cases à cocher) pour faire apparaître la **barre d'actions en masse** :

| Action | Description |
|---|---|
| **Supprimer (corbeille)** | Envoie les mails à la corbeille Gmail (récupérables 30 jours) |
| **Supprimer définitivement** | Suppression irréversible des mails |
| **Archiver Gmail** | Retire les mails de la boîte de réception (label INBOX) |
| **Marquer comme lu** | Marque tous les mails sélectionnés comme lus |
| **Marquer comme non lu** | Marque tous les mails sélectionnés comme non lus |
| **Ajouter un label** | Applique un label Gmail aux mails sélectionnés |
| **Archiver sur NAS** | Sauvegarde les mails en EML sur votre NAS |

> 📸 *Capture d'écran suggérée : barre d'actions en masse avec mails sélectionnés*

### Tout sélectionner

Cochez la case dans l'en-tête du tableau pour sélectionner tous les mails de la page courante.

### Archiver tous les résultats

Le bouton **Tout archiver** lance un archivage différentiel de **tous** les mails correspondant à la recherche en cours, sans sélection manuelle. C'est un job asynchrone avec suivi en temps réel.

---

## Opérations asynchrones

Les opérations en masse sont exécutées en arrière-plan via des **jobs**. Quand vous lancez une opération :

1. Un job est créé immédiatement
2. Une **modale de progression** s'affiche avec une barre de progression en temps réel
3. Vous pouvez fermer la modale — le job continue en arrière-plan
4. Consultez la page **Jobs** pour suivre tous vos jobs en cours

> 📸 *Capture d'écran suggérée : modale JobProgressModal avec barre de progression à 60%*

!!! tip "Annulation"
    Vous pouvez annuler un job en cours depuis la page **Jobs**. Les mails déjà traités ne sont pas annulés.

---

## Raccourcis clavier

La page Mes mails supporte des raccourcis clavier pour une navigation rapide :

| Touche | Action |
|---|---|
| ++j++ | Mail suivant |
| ++k++ | Mail précédent |
| ++enter++ / ++o++ | Ouvrir le mail sélectionné |
| ++e++ | Archiver (Gmail) |
| ++"#"++ | Supprimer (corbeille) |
| ++r++ | Marquer comme lu |
| ++u++ | Marquer comme non lu |
| ++"/"++ | Focus sur la barre de recherche |
| ++escape++ | Désélectionner |

Les raccourcis sont automatiquement désactivés quand vous tapez dans un champ de saisie.

> 📸 *Capture d'écran suggérée : bandeau de raccourcis clavier en bas de la page Mes mails*
