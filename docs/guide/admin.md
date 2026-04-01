# Administration

La page **Administration** est réservée aux utilisateurs ayant le rôle **admin**. Elle permet de gérer les utilisateurs, de surveiller les jobs et de consulter les statistiques système.

---

## Gestion des utilisateurs

### Liste des utilisateurs

Le tableau affiche tous les utilisateurs de l'instance avec :

- Email, nom d'affichage, avatar
- Rôle (user / admin)
- Nombre de comptes Gmail connectés
- Espace de stockage utilisé
- Date de dernière connexion
- Statut (actif / inactif)

La liste est paginée et permet la recherche par email ou nom.

> 📸 *Capture d'écran suggérée : tableau des utilisateurs avec les colonnes mentionnées*

### Modifier un utilisateur

Cliquez sur un utilisateur pour modifier :

- **Rôle** : promouvoir en admin ou rétrograder en user
- **Quotas** :
    - Nombre maximal de comptes Gmail (défaut : 5)
    - Quota de stockage des archives (défaut : 1 Go)
- **Statut** : activer ou désactiver le compte

> 📸 *Capture d'écran suggérée : formulaire de modification d'un utilisateur avec les champs rôle, quotas et statut*

---

## Jobs globaux

L'onglet **Jobs** affiche les jobs de **tous les utilisateurs** avec :

- L'utilisateur qui a lancé le job
- Le type et le statut
- La progression
- La date de création

Les administrateurs peuvent annuler n'importe quel job en cours.

---

## Statistiques système

L'onglet **Statistiques** affiche :

- Nombre total d'utilisateurs
- Nombre de comptes Gmail connectés
- Espace de stockage total utilisé
- Nombre de jobs en cours

> 📸 *Capture d'écran suggérée : tableau de bord admin avec les statistiques système*

---

## Vérification d'intégrité

Les administrateurs peuvent vérifier la cohérence entre les fichiers EML sur le NAS et l'index PostgreSQL :

- **Fichiers manquants** : référencés en base mais absents du disque
- **Fichiers orphelins** : présents sur le disque sans enregistrement en base
- **Fichiers corrompus** : fichiers vides (0 octets)

La vérification peut être lancée manuellement ou s'exécute automatiquement **chaque nuit à 3h**. En cas de problème, un événement webhook `integrity.failed` est déclenché.

> 📸 *Capture d'écran suggérée : résultat d'une vérification d'intégrité (statut sain / problèmes détectés)*
