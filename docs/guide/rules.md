# Règles automatiques

Les règles vous permettent d'automatiser le nettoyage et l'organisation de votre boîte Gmail. Définissez des conditions et des actions — Nid les exécute pour vous.

---

## Vue d'ensemble

Une règle se compose de :

- **Conditions** : quels mails cibler (expéditeur, objet, taille, etc.)
- **Action** : que faire avec ces mails (supprimer, archiver, labelliser, etc.)
- **Planification** : quand exécuter la règle (manuellement, quotidiennement, hebdomadairement, etc.)

> 📸 *Capture d'écran suggérée : page Règles avec la liste des règles configurées (nom, conditions résumées, action, planification, toggle actif/inactif)*

---

## Créer une règle

1. Dans **Règles**, cliquez sur **Créer une règle**
2. Renseignez les champs du formulaire

> 📸 *Capture d'écran suggérée : formulaire de création de règle (modal) avec les champs conditions, action et planification*

### Conditions

Vous pouvez combiner plusieurs conditions. **Toutes les conditions** doivent être remplies pour qu'un mail soit ciblé (logique ET).

| Champ | Description | Exemple |
|---|---|---|
| `from` | Expéditeur | `newsletter@example.com` |
| `to` | Destinataire | `mon-alias@gmail.com` |
| `subject` | Objet du mail | `promotion` |
| `has_attachment` | Présence de pièce jointe | `true` / `false` |
| `size_gt` | Taille minimale (en octets) | `5242880` (5 Mo) |
| `older_than` | Ancienneté minimale | `30d`, `6m`, `1y` |
| `label` | Label Gmail | `INBOX`, `SPAM`, `Label_123` |
| `is_unread` | Non lu | `true` / `false` |

Opérateurs disponibles : `contains` (contient), `equals` (exact), `not_contains` (ne contient pas), `gt` (supérieur), `lt` (inférieur).

### Actions

| Action | Description |
|---|---|
| **Mettre à la corbeille** | Envoie les mails à la corbeille Gmail |
| **Supprimer définitivement** | Suppression irréversible |
| **Archiver (Gmail)** | Retire de la boîte de réception |
| **Archiver sur NAS** | Sauvegarde en EML sur votre NAS |
| **Ajouter un label** | Applique un label Gmail |
| **Retirer un label** | Retire un label Gmail |
| **Marquer comme lu** | Marque les mails comme lus |
| **Marquer comme non lu** | Marque les mails comme non lus |

### Planifications

| Option | Description |
|---|---|
| **Manuel** | Exécution uniquement à la demande |
| **Toutes les heures** | S'exécute chaque heure |
| **Quotidien** | S'exécute une fois par jour |
| **Hebdomadaire** | S'exécute chaque lundi |
| **Mensuel** | S'exécute le 1er de chaque mois |

---

## Templates de règles

Pour démarrer rapidement, Nid propose une **bibliothèque de templates** pré-configurés.

1. Cliquez sur **Templates** en haut de la page Règles
2. Parcourez les modèles par catégorie :
    - **Nettoyage** : supprimer les mails promotionnels, les vieilles notifications
    - **Archive** : archiver les factures, les mails anciens
    - **Organisation** : labelliser automatiquement par expéditeur
3. Cliquez sur **Utiliser** sur un template
4. La règle est créée — modifiez-la si nécessaire puis activez-la

> 📸 *Capture d'écran suggérée : drawer/panneau des templates de règles avec les 3 catégories*

Exemples de templates :

- "Nettoyer les notifications GitHub > 30 jours"
- "Archiver les factures de plus de 3 mois"
- "Supprimer les newsletters non lues > 30 jours"

---

## Prévisualiser une règle

Avant d'exécuter une règle, vous pouvez la **prévisualiser** :

1. Cliquez sur **Prévisualiser** sur une règle existante
2. Nid affiche la liste des mails qui correspondent aux conditions
3. Vérifiez que les mails ciblés sont bien ceux que vous attendez
4. Cliquez sur **Exécuter** pour lancer la règle

> 📸 *Capture d'écran suggérée : résultat de la prévisualisation d'une règle avec la liste des mails qui matchent*

---

## Exécuter une règle

### Exécution manuelle

Cliquez sur **Exécuter** sur une règle pour la lancer immédiatement. Un job est créé avec suivi en temps réel.

### Exécution planifiée

Si une planification est configurée (quotidien, hebdomadaire, etc.), la règle s'exécute automatiquement. Le champ **Dernière exécution** indique quand la règle a été exécutée pour la dernière fois.

---

## Activer / désactiver une règle

Le **toggle** à côté de chaque règle permet de l'activer ou la désactiver sans la supprimer. Une règle désactivée n'est pas exécutée lors des planifications automatiques.

---

## Modifier et supprimer

- Cliquez sur une règle pour ouvrir le formulaire d'édition
- Le bouton **Supprimer** supprime définitivement la règle
