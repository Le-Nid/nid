# Vue d'ensemble

La **Vue d'ensemble** (`/overview`, « Accueil » sur mobile) donne l'état du compte Gmail actif et la prochaine action utile. C'est la page d'arrivée de Nid.

---

## En-tête

« Bonjour {nom} », suivi de l'adresse du compte et de l'état de la sauvegarde (« Dernière sauvegarde il y a … » ou « Aucune sauvegarde pour l'instant »).

---

## Indicateurs

Quatre cartes cliquables (2×2 sur mobile) :

| Carte | Contenu | Mène à |
|---|---|---|
| **Mails dans Gmail** | nombre de mails du compte, « N non lus » | [Mails](mails.md) |
| **Récupérable** | volume total des expéditeurs analysés, « N expéditeurs à nettoyer » (ou « Analyse des expéditeurs à lancer ») | [Nettoyage](cleanup.md) |
| **Sauvegarde NAS** | part des mails Gmail déjà archivés (en %), nombre de mails archivés, et le volume économisé par la déduplication des pièces jointes | [Archives](archives.md) |
| **Règles actives** | nombre de règles actives, « N mails traités ces 30 derniers jours » | [Règles & libellés](rules.md) |

---

## Mails reçus — 30 derniers jours

Une barre par jour, d'après les archives (date de réception des mails sauvegardés) : le graphique est fidèle quand la sauvegarde automatique est active. Les mêmes chiffres sont lus par les lecteurs d'écran sous forme de tableau. **Tout voir** ouvre [Archives](archives.md).

---

## Top encombreurs

Les expéditeurs qui vous envoient le plus de mails, avec « N mails · taille ». **Tout voir** ouvre [Nettoyage](cleanup.md).

---

## Suggestions

Nid repère des expéditeurs à traiter, par exemple :

- « {expéditeur} : N mails jamais lus (taille). »
- « {expéditeur} occupe {taille} avec N mails. »
- « {expéditeur} vous a envoyé N mails que vous lisez peu. »

Chaque suggestion propose :

- **Se désabonner et nettoyer** — même action que dans [Nettoyage](cleanup.md#se-desabonner-et-nettoyer) (désactivé si l'expéditeur ne propose pas de désabonnement automatique) ; la progression s'affiche sur la suggestion, qui disparaît une fois l'action terminée ;
- **Toujours faire ça** — ouvre le formulaire de [règle](rules.md#creer-une-regle) pré-rempli avec l'expéditeur ;
- **Ignorer** — masque la suggestion.

---

## Plus gros mails et plus grosses pièces jointes

Les 5 mails archivés les plus lourds (objet, expéditeur, taille) et les 5 pièces jointes les plus lourdes (nom, objet du mail, taille). **Tout voir** ouvre [Archives](archives.md) ou [Pièces jointes](attachments.md), triées par taille.

---

## Jobs en cours

Les tâches en cours d'exécution, avec leur progression. **Tout voir** ouvre [Activité](activity.md).
