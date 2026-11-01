# Pièces jointes

La page **Pièces jointes** (`/attachments`) liste toutes les pièces jointes du compte actif, des plus lourdes aux plus légères. Elle n'a pas d'entrée dans la barre latérale : ouvrez-la depuis la palette de commandes (`⌘K` / `Ctrl+K`, groupe **Autres pages**).

Pour un tri rapide des gros mails avec actions de masse, l'onglet **Gros mails & pièces jointes** de [Nettoyage](cleanup.md#gros-mails-pieces-jointes) suffit généralement.

---

## Source

Deux boutons choisissent la source :

- **Archives** (par défaut) : pièces jointes des mails sauvegardés sur le NAS. Une recherche **par nom, sujet, expéditeur ou contenu** est disponible : le texte des PDF et des documents Word (.docx) est cherché aussi (mêmes règles que la recherche des [Archives](archives.md) : sans accents, `"phrase exacte"`, `-exclure`, `OR`), et l'extrait trouvé s'affiche sous le nom du fichier.
- **Live** : pièces jointes de plus de 100 Ko encore dans Gmail.

La source, la recherche et la page sont gardées dans l'adresse. **Recharger** relance le chargement.

---

## Indicateurs

- **Pièces jointes** : nombre de fichiers ;
- **Taille totale** ;
- **Source** : « Archives locales » ou « Gmail (>100 Ko) » ;
- **Espace économisé** : gain de la déduplication des pièces jointes archivées (« N fichier(s) dupliqué(s), X économisés »). Un fichier identique (même contenu) n'est écrit qu'une fois par compte, que le mail vienne d'une sauvegarde Gmail, d'un compte IMAP ou d'un import mbox / .eml. Si une partie des fichiers archivés avant cette déduplication n'a pas encore été analysée, le bouton **Analyser** lance ce calcul et fusionne les doublons.

---

## Liste

Colonnes : **Fichier**, **Mail**, **Taille**, **Date**, **Type**, **Actions**. La liste est paginée.

- **Télécharger** : enregistre le fichier.
- **Voir** : ouvre le fichier dans le navigateur, seulement pour les images (PNG, JPEG, GIF, WebP) et les PDF.
