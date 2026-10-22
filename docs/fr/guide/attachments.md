# Pièces jointes

La page **Pièces jointes** (`/attachments`) liste toutes les pièces jointes du compte actif, des plus lourdes aux plus légères. Elle n'a pas d'entrée dans la barre latérale : ouvrez-la depuis la palette de commandes (`⌘K` / `Ctrl+K`, groupe **Autres pages**).

Pour un tri rapide des gros mails avec actions de masse, l'onglet **Gros mails & pièces jointes** de [Nettoyage](cleanup.md#gros-mails-pieces-jointes) suffit généralement.

---

## Source

Deux boutons choisissent la source :

- **Archives** (par défaut) : pièces jointes des mails sauvegardés sur le NAS. Une recherche **par nom, sujet ou expéditeur** est disponible.
- **Live** : pièces jointes de plus de 100 Ko encore dans Gmail.

La source, la recherche et la page sont gardées dans l'adresse. **Recharger** relance le chargement.

---

## Indicateurs

- **Pièces jointes** : nombre de fichiers ;
- **Taille totale** ;
- **Source** : « Archives locales » ou « Gmail (>100 Ko) » ;
- **Espace économisé** : gain de la déduplication des pièces jointes archivées (« N fichier(s) dupliqué(s), X économisés »). Si une partie des fichiers n'a pas encore été analysée, le bouton **Analyser** lance ce calcul.

---

## Liste

Colonnes : **Fichier**, **Mail**, **Taille**, **Date**, **Type**, **Actions**. La liste est paginée.

- **Télécharger** : enregistre le fichier.
- **Voir** : ouvre le fichier dans le navigateur, seulement pour les images (PNG, JPEG, GIF, WebP) et les PDF.
