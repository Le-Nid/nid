# Archivage

Nid vous permet de sauvegarder vos mails sur votre NAS au format **EML** (un fichier par mail). Les archives sont indexées dans PostgreSQL pour une recherche rapide.

---

## Pourquoi archiver ?

- **Libérer votre quota Gmail** : supprimez les mails de Gmail après les avoir archivés localement
- **Sauvegarde durable** : les fichiers EML sont au format standard, lisibles par n'importe quel client mail (Thunderbird, Outlook, etc.)
- **Recherche rapide** : les archives sont indexées en full-text dans PostgreSQL
- **Vos données chez vous** : aucune donnée ne quitte votre réseau

---

## Archiver des mails

### Archivage par sélection

1. Dans **Mes mails**, sélectionnez les mails à archiver
2. Cliquez sur **Archiver sur NAS** dans la barre d'actions
3. Un job d'archivage est créé avec suivi en temps réel

### Archivage par requête (tout archiver)

1. Dans **Mes mails**, saisez une requête de recherche (ex. `from:amazon.fr older_than:6m`)
2. Cliquez sur **Tout archiver**
3. Tous les mails correspondants sont archivés en différentiel

### Archivage différentiel

L'archivage est **différentiel** par défaut : seuls les mails qui n'ont pas encore été archivés sont traités. Si vous archivez deux fois la même requête, la deuxième exécution ne traite que les nouveaux mails.

> 📸 *Capture d'écran suggérée : bouton "Tout archiver" sur la page Mes mails*

---

## Consulter les archives

La page **Archives** dans la sidebar affiche tous vos mails archivés.

### Recherche full-text

La barre de recherche permet une **recherche full-text** dans vos archives. La recherche porte sur :

- **L'objet du mail** (priorité la plus haute)
- **L'expéditeur** (priorité moyenne)
- **Le contenu** du mail (extrait/snippet, priorité la plus basse)

> 📸 *Capture d'écran suggérée : page Archives avec la barre de recherche full-text et les résultats*

### Tri et filtres

Vous pouvez trier les archives par :

- Date (plus récent / plus ancien)
- Taille (plus gros / plus petit)
- Expéditeur

### Lecture d'un mail archivé

Cliquez sur un mail archivé pour l'ouvrir dans le lecteur intégré. Le contenu est lu directement depuis le fichier EML sur le disque.

Si le mail est **chiffré**, il sera déchiffré à la volée (vous devrez avoir configuré votre passphrase — voir [Vie privée](privacy.md#chiffrement-des-archives)).

### Vue par conversations (threads)

Les archives supportent la vue **conversations** : les mails partageant le même thread sont regroupés. Basculez entre la vue liste et la vue conversations avec le toggle en haut de la page.

> 📸 *Capture d'écran suggérée : toggle liste/conversations sur la page Archives*

---

## Pièces jointes archivées

Les pièces jointes sont extraites et stockées séparément lors de l'archivage. Vous pouvez les télécharger individuellement depuis :

- Le lecteur de mail archivé
- La page **Pièces jointes** (onglet Archives)

---

## Export ZIP

Exportez une sélection de mails archivés au format ZIP :

1. Dans **Archives**, sélectionnez les mails à exporter
2. Cliquez sur **Exporter en ZIP**
3. Un fichier ZIP contenant les fichiers EML est téléchargé

---

## Organisation sur le disque

Les archives sont organisées sur le NAS selon la structure suivante :

```
/archives/
└── {account_id}/
    └── {année}/
        └── {mois}/
            ├── {message_id}.eml
            └── attachments/
                ├── facture.pdf
                └── photo.jpg
```

Chaque mail est identifié par un UUID unique (le `gmail_message_id`).

---

## Corbeille des archives

Les mails archivés peuvent être supprimés via la **corbeille**. La suppression est un **soft-delete** : les mails ne sont pas immédiatement effacés du disque.

### Supprimer des archives

1. Dans **Archives**, sélectionnez les mails à supprimer
2. Cliquez sur **Supprimer** dans la barre d'actions
3. Confirmez la suppression — les mails sont déplacés vers la corbeille

> 📸 *Capture d'écran suggérée : bouton Supprimer et confirmation dans la barre d'actions des archives*

### Consulter la corbeille

Basculez vers l'onglet **Corbeille** (à côté de Liste et Conversations) pour voir les mails supprimés :

- Chaque mail affiche sa **date de suppression** et le **temps restant** avant la purge définitive
- Un indicateur couleur signale les mails proches de l'expiration (rouge ≤ 3 jours, orange ≤ 7 jours)

> 📸 *Capture d'écran suggérée : onglet Corbeille avec les indicateurs d'expiration*

### Restaurer des mails

1. Dans l'onglet **Corbeille**, sélectionnez les mails à restaurer
2. Cliquez sur **Restaurer** dans la barre d'actions
3. Les mails retrouvent leur place dans les archives

Vous pouvez aussi restaurer un mail individuel en cliquant sur l'icône de restauration dans sa ligne.

### Vider la corbeille

Le bouton **Vider la corbeille** supprime **définitivement** tous les mails de la corbeille :

- Les fichiers EML sont supprimés du disque
- Les pièces jointes associées sont supprimées
- Les enregistrements sont supprimés de la base de données
- **Cette action est irréversible**

### Purge automatique

Un job planifié purge automatiquement les mails en corbeille depuis plus de **30 jours** (par défaut). Ce job s'exécute quotidiennement à 4h du matin.

Vous pouvez configurer la purge depuis la page **Jobs** :

- **Activer/désactiver** la purge automatique
- **Modifier la durée** de rétention (1 à 365 jours)

> 📸 *Capture d'écran suggérée : section configuration corbeille dans la page Jobs*

::: tip Conseil
Si vous supprimez accidentellement des mails importants, vous pouvez les restaurer tant qu'ils n'ont pas été purgés. Consultez régulièrement la corbeille pour éviter les surprises.
:::
