# Analytics et Insights

Nid offre des outils d'analyse pour mieux comprendre vos habitudes email et identifier les opportunités de nettoyage.

---

## Heatmap d'activité

Une carte thermique visualise votre activité email sur une grille **jour de la semaine × heure de la journée**. Chaque cellule indique le nombre de mails reçus pendant ce créneau.

> 📸 *Capture d'écran suggérée : heatmap d'activité avec les jours en lignes et les heures en colonnes, colorée du bleu clair au bleu foncé*

Utilisez cette vue pour :

- Identifier vos pics de réception (ex. : lundi matin, mardi 14h)
- Comprendre quand vous êtes le plus sollicité par email

---

## Scores d'encombrement

Chaque expéditeur reçoit un **score d'encombrement** calculé à partir de :

- Nombre de mails envoyés
- Taille totale des mails
- Nombre de mails non lus
- Taux de lecture (mails lus / total)
- Présence d'un lien de désabonnement

Plus le score est élevé, plus l'expéditeur "encombre" votre boîte.

> 📸 *Capture d'écran suggérée : tableau des scores d'encombrement avec les colonnes expéditeur, nombre de mails, taille, taux de lecture, score*

---

## Suggestions de nettoyage

Nid génère automatiquement des **suggestions de nettoyage** basées sur l'analyse de vos mails :

| Type de suggestion | Description |
|---|---|
| **Expéditeurs en masse** | Expéditeurs qui envoient beaucoup de mails rarement lus |
| **Gros expéditeurs** | Expéditeurs dont les mails occupent beaucoup d'espace |
| **Newsletters anciennes** | Newsletters non lues depuis longtemps |
| **Patterns de doublons** | Mails similaires en grand nombre |

Chaque suggestion indique le nombre de mails concernés et l'espace récupérable.

> 📸 *Capture d'écran suggérée : liste des suggestions de nettoyage avec le type, la description, et les boutons d'action*

### Ignorer une suggestion

Si une suggestion n'est pas pertinente, cliquez sur **Ignorer** pour la masquer. Elle ne réapparaîtra pas.

---

## Inbox Zero Tracker

Le tracker **Inbox Zero** mesure votre progression vers une boîte de réception vide :

- **Nombre de mails** dans la boîte de réception
- **Nombre de mails non lus**
- **Historique** : graphique montrant l'évolution au fil du temps

> 📸 *Capture d'écran suggérée : graphique Inbox Zero montrant l'évolution du nombre de mails dans la boîte de réception*

Un snapshot est enregistré automatiquement **toutes les 6 heures** pour alimenter l'historique.

---

## Rapport hebdomadaire

Chaque **lundi**, un rapport hebdomadaire est automatiquement généré pour chaque compte Gmail :

- Nombre de mails reçus, archivés et supprimés pendant la semaine
- Top expéditeurs de la semaine
- Règles exécutées et espace libéré
- Évolution par rapport à la semaine précédente

Le rapport est envoyé comme **notification in-app** et peut être consulté depuis la page **Insights**.

> 📸 *Capture d'écran suggérée : page Insights avec le rapport hebdomadaire (résumé chiffré + graphiques)*

---

## Cache des analytics

Les données d'analytics sont calculées à la demande et mises en cache pendant **15 minutes** dans Redis pour des performances optimales.
