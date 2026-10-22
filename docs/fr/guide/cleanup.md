# Nettoyage

La page **Nettoyage** (`/cleanup`) sert à récupérer de l'espace en peu de gestes. Son en-tête résume le gain possible : « 6,1 Go récupérables. Les 8 premiers expéditeurs pèsent 4,6 Go. »

Deux onglets : **Expéditeurs & newsletters** et **Gros mails & pièces jointes**.

---

## Expéditeurs & newsletters

### Analyser la boîte

Au premier passage : « Aucune analyse pour ce compte ». Cliquez sur **Analyser la boîte** : Nid regroupe par expéditeur les mails de listes de diffusion et de newsletters. L'analyse tourne en arrière-plan, vous pouvez quitter la page.

Ensuite, la date de la dernière analyse s'affiche (« Analyse du … ») avec **Relancer l'analyse**.

### Liste des expéditeurs

Pour chaque expéditeur : **Expéditeur**, **Adresse**, **Taille**, **Mails**, **Jamais ouverts**, et ses actions.

- **Trier par** : **Nombre de mails**, **Taille** ou **Jamais ouverts**.
- **Newsletters uniquement (List-Unsubscribe)** : ne garde que les expéditeurs qui proposent un désabonnement automatique.

Le tri et le filtre sont gardés dans l'adresse de la page.

### Actions sur un expéditeur

| Action | Effet |
|---|---|
| **Se désabonner et nettoyer** | désabonnement, puis tous ses mails vers la corbeille Gmail |
| **Tout supprimer** | tous ses mails vers la corbeille Gmail, sans désabonnement |
| **Toujours faire ça** | ouvre le formulaire de [règle](rules.md#creer-une-regle) pré-rempli avec l'expéditeur, pour traiter aussi ses prochains mails |

Sur mobile, le bouton `⋯` d'une carte ouvre ces actions dans un panneau.

#### Se désabonner et nettoyer

Une confirmation s'affiche : « Se désabonner de {expéditeur} ? ». La page de désabonnement de l'expéditeur s'ouvre dans un nouvel onglet : **le désabonnement est définitif**. Ses mails partent ensuite vers la corbeille Gmail.

Si l'expéditeur ne fournit pas d'en-tête `List-Unsubscribe`, le bouton est désactivé avec la mention « Cet expéditeur ne propose pas de désabonnement automatique » ; **Tout supprimer** et **Toujours faire ça** restent disponibles.

#### Annulation et progression

La suppression des mails (après désabonnement ou via **Tout supprimer**) affiche le toast « Suppression de N mails dans 10 s » avec **Annuler**, comme dans [Mails](mails.md#annuler). La progression s'affiche ensuite sur la ligne de l'expéditeur, avec **Arrêter**. La tâche est aussi visible dans [Activité](activity.md).

---

## Gros mails & pièces jointes

Les pièces jointes les plus lourdes du compte, triées par taille. Le résumé indique « N pièces jointes · taille ».

**Source** :

- **Gmail** : les mails Gmail avec une pièce jointe de plus de 100 Ko. Cochez des lignes pour **Sauvegarder sur le NAS** ou **Supprimer** les mails correspondants (suppression annulable 10 s).
- **Archives (NAS)** : les pièces jointes déjà archivées. Ces mails ne sont plus traités ici ; téléchargement seulement.

Colonnes : **Fichier**, **Mail** (objet), **Taille**, **Date**, et un bouton de téléchargement.

Pour toutes les pièces jointes, avec recherche et pagination, voir la page [Pièces jointes](attachments.md).
