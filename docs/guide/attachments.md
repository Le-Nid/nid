# Pièces jointes

La page **Pièces jointes** centralise toutes les pièces jointes de vos mails, qu'ils soient dans Gmail ou dans vos archives locales.

---

## Deux onglets

La page est divisée en deux onglets :

### Archives (NAS)

Les pièces jointes des mails archivés sur votre NAS. Elles sont stockées séparément des fichiers EML et indexées dans la base de données.

- Recherche par nom de fichier
- Tri par taille ou par date
- Téléchargement direct

### Gmail (Live)

Les pièces jointes des mails encore dans votre boîte Gmail. Un scan est effectué via l'API Gmail pour récupérer la liste.

- Scan à la demande
- Tri par taille pour identifier les fichiers les plus volumineux
- Navigation vers le mail dans Gmail

> 📸 *Capture d'écran suggérée : page Pièces jointes avec les deux onglets Archives / Gmail, la liste des PJ et les boutons de tri*

---

## Recherche et tri

Vous pouvez :

- **Rechercher** par nom de fichier (ex. : `facture`, `.pdf`, `photo.jpg`)
- **Trier par taille** : les plus gros fichiers en premier — idéal pour libérer de l'espace
- **Trier par date** : les plus récents ou les plus anciens en premier
- **Paginer** : naviguez entre les pages de résultats

---

## Téléchargement

Cliquez sur le bouton **Télécharger** à côté d'une pièce jointe pour la télécharger directement. Les pièces jointes archivées sont servies depuis le NAS, les pièces jointes Gmail sont récupérées via l'API Gmail.

---

## Cas d'usage

- **Libérer de l'espace Gmail** : identifiez les pièces jointes les plus volumineuses, archivez les mails correspondants sur le NAS, puis supprimez-les de Gmail
- **Retrouver un fichier** : recherchez un nom de fichier dans les archives
- **Audit de stockage** : visualisez la répartition des types de pièces jointes

---

## Déduplication par hash de contenu

Gmail Manager déduplique automatiquement les pièces jointes identiques lors de l'archivage. Chaque fichier est identifié par son hash SHA-256 : si deux mails contiennent exactement la même pièce jointe, le fichier n'est stocké qu'une seule fois sur le disque.

### Statistiques

La carte **Espace économisé** affiche :

- Le volume d'espace disque économisé grâce à la déduplication
- Le nombre de fichiers dupliqués détectés
- La couverture du hash (pourcentage de pièces jointes analysées)

### Backfill

Si vous avez archivé des mails avant l'activation de la déduplication, cliquez sur le bouton **Analyser** pour calculer les hash des pièces jointes existantes. Cette opération :

1. Lit chaque fichier sur le stockage (local ou S3)
2. Calcule le hash SHA-256
3. Identifie les doublons et supprime les copies redondantes
4. Met à jour la base de données pour pointer vers le fichier unique

> ⚠️ Le backfill peut prendre du temps si vous avez beaucoup de pièces jointes archivées.
