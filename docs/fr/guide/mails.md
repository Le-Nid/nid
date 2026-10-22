# Mails

La page **Mails** (`/mails`) liste les mails Gmail du compte actif. On y cherche, on sélectionne et on agit en masse, avec un délai d'annulation pour les actions réversibles.

---

## En-tête

- Titre **Mails** et nombre estimé de résultats (« ~N résultats », estimation fournie par Gmail).
- **Actualiser** : recharge la liste.
- **Tout sauvegarder sur le NAS** : sauvegarde tous les résultats de la recherche courante dans les [Archives](archives.md) (seuls les mails pas encore archivés sont copiés).
- **Créer une règle** (si une recherche est saisie) : ouvre le formulaire de [règle](rules.md#creer-une-regle) ; si la recherche est un seul `from:adresse`, l'expéditeur est pré-rempli.

---

## Compte : un compte ou « Tous les comptes »

Quand au moins deux comptes Gmail sont connectés, un sélecteur **Compte Gmail** apparaît au-dessus de la liste. Il propose chaque compte et **Tous les comptes** (adresse `/mails?account=all`, qui remplace l'ancienne boîte unifiée).

En mode **Tous les comptes** :

- une colonne **Compte** indique à quel compte appartient chaque mail ;
- les actions sur une sélection sont envoyées compte par compte ;
- **Créer une règle** n'est proposé que si la sélection vient d'un seul compte ;
- **Ajouter un libellé**, **Tout sauvegarder sur le NAS**, la sélection de tous les résultats et le bouton **Afficher plus** ne sont pas disponibles.

---

## Rechercher

La barre de recherche accepte la syntaxe Gmail : mots-clés et opérateurs (`from:`, `has:attachment`, `larger:10M`, `older_than:1y`…). À la validation (`Entrée`), chaque opérateur devient une **étiquette** que l'on retire d'un clic ; le reste reste en texte libre.

### Recherches rapides et recherches enregistrées

Au-dessus de la barre, des puces appliquent une recherche en un clic :

| Puce | Requête Gmail |
|---|---|
| Tous | *(vide)* |
| Non lus | `is:unread` |
| Avec PJ | `has:attachment` |
| Gros mails > 10 Mo | `larger:10m` |
| Promotions > 6 mois | `category:promotions older_than:6m` |
| Réseaux sociaux | `category:social` |
| Plus d'un an | `older_than:1y` |
| Spam | `in:spam` |
| Corbeille | `in:trash` |

Vos **recherches enregistrées** s'ajoutent à la suite. Pour en créer une, lancez une recherche puis cliquez sur **Enregistrer la recherche** (le bouton apparaît quand la recherche ne correspond à aucune puce) ; la puce prend pour nom le texte de la requête.

La recherche et le compte sont dans l'adresse de la page (`?q=…&account=…`) : un marque-page ou le bouton retour les conservent.

---

## La liste

Colonnes : **Expéditeur**, **Objet** (avec extrait, trombone si pièce jointe), **Libellés**, **Taille**, **Date**. Le bouton **Colonnes** masque ou affiche des colonnes. Les mails non lus sont en gras.

La liste se charge par pages : **Afficher plus** charge la suite, jusqu'à « Tous les mails sont chargés ».

Le menu `⋯` de chaque ligne propose **Ouvrir**, **Archiver (retirer de la boîte)**, **Sauvegarder sur le NAS** et **Supprimer**.

Sur mobile, chaque mail est une carte (expéditeur, date, objet) avec une case à cocher.

---

## Sélectionner

- Cochez des lignes, ou la case d'en-tête pour toute la page chargée.
- **Tous les résultats** : si une recherche est saisie et que toutes les lignes chargées sont cochées, un bandeau indique « Les N mails de cette page sont sélectionnés » avec le lien **Sélectionner les ~N résultats de la recherche**. L'action porte alors sur la requête entière côté serveur, même sur les mails non chargés ; le compteur affiche « ~N sélectionnés ».
- **Annuler la sélection** (✕) ou `Échap` vide la sélection. Changer de recherche ou de compte la vide aussi.

### Barre d'actions

Dès qu'un mail est sélectionné, la barre d'actions apparaît :

| Action | Effet |
|---|---|
| **Archiver (retirer de la boîte)** | retire les mails de la boîte de réception Gmail |
| **Sauvegarder sur le NAS** | copie les mails dans les [Archives](archives.md) |
| **Marquer comme lu** / **Marquer comme non lu** | change l'état de lecture |
| **Supprimer** | envoie les mails dans la corbeille Gmail |
| **Ajouter un libellé** | applique un libellé Gmail existant (choisi dans une liste) |
| **Créer une règle** | ouvre le formulaire de règle, pré-rempli si la sélection vient d'un seul expéditeur |

Sur mobile, la barre est en bas de l'écran : quatre actions visibles, les autres sous **Plus**.

---

## Annuler

**Supprimer** et **Archiver (retirer de la boîte)** ne partent pas tout de suite : un toast affiche par exemple « Suppression de 12 mails dans 10 s » (« Vers la corbeille Gmail · suivi dans Activité ») avec le bouton **Annuler**. Les mails disparaissent aussitôt de la liste ; **Annuler** dans les 10 secondes les remet et rien n'est fait. Après le délai, l'action s'exécute (« Trop tard pour annuler : l'action est déjà en cours » si vous cliquez trop tard).

Pendant ce délai, la tâche apparaît « En attente » dans [Activité](activity.md), où elle peut aussi être annulée.

Les autres actions (lecture, libellé, sauvegarde NAS) partent immédiatement ; leur progression s'affiche en haut de la liste.

---

## Lire un mail

Cliquez sur un mail (ou **Ouvrir**) : le lecteur s'ouvre en panneau à droite (plein écran sur mobile).

- En-tête : objet, **De**, **À**, date, libellés.
- Corps du mail dans un cadre isolé, sans scripts. Les **images distantes sont bloquées** (« Images distantes bloquées pour protéger votre vie privée. ») ; **Afficher** les charge pour ce mail. Pour les autoriser partout, voir [Paramètres › Compte](settings.md#compte).
- Pièces jointes téléchargeables, et la **Conversation** (les autres messages du fil).
- Actions : **Archiver (retirer de la boîte)**, **Sauvegarder sur le NAS**, **Supprimer**, **Créer une règle** (pré-remplie avec l'expéditeur).

---

## Raccourcis clavier

Sur ordinateur, sous la liste :

| Touche | Action |
|---|---|
| `j` / `k` | mail suivant / précédent |
| `o` | ouvrir le mail |
| `e` | archiver (retirer de la boîte) |
| `#` | supprimer |
| `r` | marquer comme lu |
| `u` | marquer comme non lu |
| `/` | aller à la recherche |
| `Échap` | vider la sélection |

`e`, `#`, `r` et `u` agissent sur la sélection, sinon sur le mail qui a le focus. Les raccourcis sont inactifs pendant la saisie et quand le lecteur ou un formulaire est ouvert.

Ce sont des raccourcis à une touche : le lien **Désactiver** sous la liste (ou l'interrupteur **Raccourcis clavier à une touche** dans [Paramètres › Compte](settings.md#compte)) les coupe, par exemple si vous utilisez une commande vocale. Le choix est mémorisé dans le navigateur.
