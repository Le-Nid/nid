# Doublons

Nid détecte automatiquement les mails en double dans vos archives et vous permet de les supprimer pour économiser de l'espace.

---

## Comment ça marche

La détection de doublons compare trois critères :

- **Objet** du mail (subject)
- **Expéditeur** (sender)
- **Date** (tronquée à la minute)

Deux mails sont considérés comme doublons s'ils partagent exactement ces trois critères. Cela arrive typiquement quand vous archivez les mêmes mails plusieurs fois.

---

## Détecter les doublons

1. Ouvrez la page **Doublons** dans la sidebar
2. Les doublons sont automatiquement détectés dans vos archives
3. Chaque groupe de doublons affiche le nombre de copies et l'espace récupérable

> 📸 *Capture d'écran suggérée : page Doublons avec les groupes de doublons détectés (sujet, expéditeur, nombre de copies)*

---

## Supprimer les doublons

Pour chaque groupe de doublons :

1. Nid conserve le mail le plus récent
2. Cliquez sur **Supprimer N doublons** pour supprimer les copies excédentaires
3. Les fichiers EML et les entrées en base de données sont supprimés

> 📸 *Capture d'écran suggérée : bouton de suppression sur un groupe de doublons*

!!! info "Suppression définitive"
    La suppression des doublons est définitive — les fichiers EML sont supprimés du NAS et les enregistrements de la base de données sont effacés. Assurez-vous que ce sont bien des doublons avant de supprimer.

---

## Doublons Gmail (Live)

En plus des archives, Nid peut aussi détecter les doublons parmi les mails encore présents dans votre boîte Gmail.
