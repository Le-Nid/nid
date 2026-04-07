# Dashboard

Le Dashboard est la page d'accueil de Nid. Il offre une vue d'ensemble de votre boîte Gmail avec des graphiques interactifs.

---

## Vue d'ensemble

Le Dashboard affiche quatre blocs de statistiques, calculées en temps réel depuis l'API Gmail :

> 📸 *Capture d'écran suggérée : page Dashboard complète avec les 4 blocs*

---

## Top expéditeurs

Un classement des expéditeurs qui vous envoient le plus de mails, avec deux vues :

- **Par nombre de mails** : qui inonde votre boîte
- **Par taille totale** : qui consomme le plus d'espace

Ce classement est utile pour identifier rapidement les expéditeurs à nettoyer ou à bloquer.

> 📸 *Capture d'écran suggérée : graphique Top expéditeurs (barres horizontales)*

---

## Mails les plus volumineux

Liste des mails les plus gros de votre boîte, triés par taille décroissante. Cliquez sur un mail pour l'ouvrir et décider si vous souhaitez le supprimer ou l'archiver.

Idéal pour libérer rapidement de l'espace dans votre quota Gmail.

---

## Timeline

Graphique en courbe montrant l'évolution du volume de mails reçus par mois. Permet d'identifier les pics d'activité et les tendances.

> 📸 *Capture d'écran suggérée : graphique Timeline (courbe mensuelle)*

---

## Répartition des labels

Graphique en camembert (ou donut) montrant la distribution de vos labels Gmail. Utile pour comprendre comment vos mails sont organisés.

---

## Statistiques des archives

En plus des statistiques Gmail, le Dashboard affiche les statistiques de vos archives locales :

- Nombre de mails archivés
- Taille totale des archives sur le NAS
- Nombre de pièces jointes archivées

---

## Cache et rafraîchissement

Les statistiques sont mises en cache pendant 15 minutes dans Redis pour éviter de surcharger l'API Gmail. Le Dashboard affiche toujours les données les plus récentes disponibles.

Pour forcer un rafraîchissement, rechargez la page.
