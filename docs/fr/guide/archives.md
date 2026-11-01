# Archives

La page **Archives** (`/archives`) donne accès à la copie locale de vos mails, sauvegardée sur le NAS au format EML. Elle reste consultable même si les mails ont été supprimés de Gmail, et même si le compte Gmail a été déconnecté.

Cinq onglets : **Mails**, **Contacts**, **Corbeille**, **Rétention**, **Partages**.

---

## En-tête et sauvegarde

- État : « Dernière sauvegarde il y a … · N mails » (ou « Aucune sauvegarde pour l'instant »).
- **Sauvegarder sur le NAS maintenant** : sauvegarde les mails du compte pas encore archivés ; la progression s'affiche sous l'en-tête et dans [Activité](activity.md).
- **Exporter (.mbox)** : télécharge les archives du compte au format mbox (lisible par Thunderbird ou Apple Mail). Si une recherche ou un filtre est actif, seuls les résultats chargés sont exportés.

D'autres façons d'alimenter les archives : **Sauvegarder sur le NAS** dans [Mails](mails.md), la **Sauvegarde automatique** d'un compte dans [Paramètres › Comptes Gmail](settings.md#comptes-gmail), les règles « Sauvegarder sur le NAS puis supprimer » et l'import mbox / .eml / IMAP de [Paramètres › Données](settings.md#donnees).

---

## Onglet Mails : rechercher

- **Arbre des libellés** (à gauche sur ordinateur) : **Tous les mails** puis les libellés qui contiennent des mails archivés, avec leur nombre. Pour un compte IMAP, ce sont ses dossiers (**Dossiers**).
- **Recherche plein texte** : objet, expéditeur, contenu et corps, ainsi que le texte des pièces jointes PDF et Word (.docx), insensible aux accents, avec `"phrase exacte"`, `-exclure` et `OR`. Les termes trouvés sont surlignés dans l'extrait ; un mail trouvé grâce à une pièce jointe affiche « Trouvé dans la pièce jointe « … » » avec l'extrait de cette pièce jointe. Les archives existantes sont indexées en tâche de fond après la mise à jour (visible dans [Activité](activity.md)).
- **Tags** (sous les libellés sur ordinateur) : **Tous les tags** puis vos tags, avec leur nombre. Un tag sélectionné filtre la liste et propose **Supprimer le tag « … »**, qui le retire de toutes les archives du compte sans supprimer les mails.
- **Filtres** : **Expéditeur**, période (**Du** / **Au**), **Taille min (Mo)** / **Taille max (Mo)**, **Type de pièce jointe** (une extension comme `pdf` ou `docx`, ou un type MIME comme `image/` pour toutes les images), **Avec pièce jointe**. Sur mobile, ils sont regroupés dans le panneau **Filtres (N)** avec le **Libellé** (le **Dossier** pour un compte IMAP) et le **Tag**, puis **Afficher les résultats**.

Les résultats (« N résultats ») affichent **Objet**, **Extrait**, **Date**, **Expéditeur**, **Taille**. **Effacer la recherche et les filtres** revient à la liste complète.

### Actions

- Menu `⋯` d'une ligne : **Ouvrir**, **Partager**, **Restaurer dans la boîte mail**, **Supprimer**.
- Sélection de plusieurs lignes : **Exporter .mbox**, **Tags**, **Restaurer dans la boîte mail**, **Supprimer**.

**Tags** ajoute ou retire les tags saisis (séparés par des virgules, vos tags existants sont proposés) sur toute la sélection. Les tags restent dans Nid : Gmail ne les voit pas, et ils sont conservés si le mail est archivé à nouveau.

**Supprimer** envoie les archives dans la corbeille des archives, avec un toast « Suppression de N archives dans 10 s » et **Annuler**.

### Lecteur d'archive

**Ouvrir** affiche le mail archivé : en-têtes, corps (images distantes bloquées, comme dans [Mails](mails.md#lire-un-mail)), pièces jointes téléchargeables, ses **Tags** (retirer un tag d'un clic, en ajouter avec le champ **Ajouter un tag…** puis Entrée) et **Conversation**. Actions : **Partager**, **Restaurer dans la boîte mail**, **Supprimer**.

### Restaurer dans la boîte mail

Remet les mails archivés dans la boîte du compte (Gmail ou serveur IMAP), à partir de leur EML. La restauration tourne en tâche de fond (visible dans [Activité](activity.md)) et une notification annonce le résultat.

**Compte Gmail** : mêmes en-têtes, même date, mêmes libellés.

- Un mail **encore dans Gmail** est ignoré ; un mail **dans la corbeille Gmail** en est sorti.
- Les libellés système (Boîte de réception, Non lu, Important, catégories…) sont remis tels quels. Un libellé supprimé depuis est recréé sous le même nom. Corbeille, Spam et Brouillons ne sont pas remis.
- Après la restauration, l'archive pointe vers le nouveau mail Gmail : la sauvegarde suivante ne le réarchive pas en double.
- Une archive **chiffrée** ne peut pas être restaurée (la phrase secrète n'est pas conservée) : elle compte comme une erreur.
- Indisponible pour un compte à reconnecter.

**Compte IMAP** : le mail est déposé, marqué lu et à sa date, dans le dossier d'où il a été archivé s'il existe encore sur le serveur, sinon dans la boîte de réception. Un mail déjà présent dans ce dossier (même Message-ID) est ignoré. Si le serveur refuse le mot de passe, la restauration échoue avec ce message et le compte passe en **Action requise**.

Un mail archivé chiffré affiche « Ce mail est chiffré : son contenu n'est pas lisible ici. » Le chiffrement des archives a été retiré de Nid : remettez ces archives en clair dans [Paramètres › Données](settings.md#archives-chiffrees).

---

## Partager un mail

**Partager** ouvre « Partager ce mail » : un lien temporaire, lisible sans compte Nid.

1. Choisissez la **Durée de validité** : 1 heure, 24 heures, 3 jours, 7 jours ou 30 jours.
2. **Créer le lien**, puis copiez-le.

La fenêtre liste aussi les liens actifs de ce mail (« Expire le … ») avec les boutons copier et révoquer.

La personne qui ouvre le lien voit le mail (« Mail partagé via lien temporaire »), images distantes bloquées. Un lien expiré, révoqué ou ayant atteint sa limite d'accès affiche « Lien introuvable ».

### Onglet Partages

Tous vos liens actifs : **Objet**, **Expéditeur**, **Expire le**, **Accès** (ouvertures / limite), copier, révoquer. Le nombre de liens actifs est aussi rappelé dans [Paramètres › Sécurité](settings.md#securite).

---

## Onglet Contacts

Le carnet d'adresses de l'archive, tiré des en-têtes **De** et **À** des mails archivés (corbeille exclue). Votre propre adresse n'y figure pas.

- Chaque contact affiche son **nom** (un des noms vus dans ses mails), son **adresse**, le nombre de mails archivés où il est **Comme expéditeur** et **Comme destinataire** (champ À, avec d'éventuels autres destinataires) et la date du **Dernier échange**.
- Les contacts avec qui vous échangez le plus apparaissent en premier ; **Rechercher un contact** filtre par nom ou adresse.
- Un clic sur un contact ouvre l'onglet **Mails** filtré sur cet expéditeur.

Seul le champ **À** est lu : les destinataires en copie (Cc) n'apparaissent pas.

---

## Onglet Corbeille

Les archives supprimées y restent avant d'être effacées du NAS.

- « N mails dans la corbeille », avec la date **Supprimé le**.
- **Restaurer** un mail, ou sélectionnez-en plusieurs puis **Restaurer**.
- **Vider la corbeille** : après confirmation, supprime définitivement les mails et leurs pièces jointes du NAS. Irréversible.
- Purge automatique : « Les mails de la corbeille sont supprimés définitivement après N jours » (ou « Purge automatique de la corbeille désactivée »). Les administrateurs règlent ici **Purge automatique** et **Durée avant purge (jours)** pour toute l'instance (voir aussi [Admin › Système](admin.md#systeme)).

---

## Onglet Rétention

« Supprime les archives plus anciennes qu'une durée, pour un libellé ou toutes. »

- **Nouvelle politique** : **Nom**, **Libellé** (ou **Tous les libellés**), **Supprimer après (jours)**.
- La liste affiche **Nom**, **Libellé**, **Âge** (« Plus de N jours ») et **Dernière exécution** (avec le nombre d'archives supprimées).
- **Exécuter maintenant** applique toutes les politiques.
- Menu d'une politique : modifier, supprimer (après confirmation ; les archives déjà supprimées ne reviennent pas).

Sans politique, les archives sont conservées sans limite de durée.
