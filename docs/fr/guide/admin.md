# Administration

La page **Admin** (`/admin`) est réservée aux utilisateurs ayant le rôle **admin** : l'entrée n'apparaît que pour eux (groupe **Administration** de la barre latérale, ou **Plus › Administration** sur mobile), et l'adresse renvoie les autres vers la Vue d'ensemble.

Trois onglets : **Utilisateurs**, **Système**, **Audit**.

---

## Utilisateurs

Recherche par **Email ou nom**, puis la liste paginée :

| Colonne | Contenu |
|---|---|
| **Utilisateur** | email et nom |
| **Rôle** | Admin ou Utilisateur |
| **Statut** | Actif ou Désactivé |
| **Comptes Gmail** | « N / max comptes » |
| **Stockage** | archives utilisées / quota |
| **Dernière connexion** | date, ou « Jamais connecté » |

**Modifier** ouvre « Modifier l'utilisateur » :

- **Rôle** : Utilisateur ou Admin ;
- **Compte actif** : un compte désactivé ne peut plus se connecter (« Ce compte a été désactivé ») ;
- **Comptes Gmail maximum** ;
- **Quota de stockage (Go)**.

Sous le formulaire :

- **Réinitialiser le mot de passe** : définit un nouveau mot de passe (8 caractères minimum) à transmettre à l'utilisateur ; ses sessions ouvertes sont déconnectées (pour votre propre mot de passe, passez par Paramètres › Sécurité) ;
- **Supprimer l'utilisateur** : après confirmation, supprime définitivement le compte, ses comptes Gmail et ses archives. Indisponible sur votre propre compte (passez par [Paramètres › Données](settings.md#supprimer-mon-compte)) ; le dernier admin actif ne peut pas être supprimé.

---

## Système

« Réglages de l'instance Nid, pour tous les utilisateurs. »

### Corbeille des archives

- **Durée maximale dans la corbeille** : 7, 30 ou 90 jours.
- Volume actuel (« N mails · taille ») et date de la prochaine purge (ou « purge automatique désactivée »).
- **Vider la corbeille maintenant…** : après confirmation (« Vider définitivement la corbeille ? »), supprime du NAS les mails de la corbeille **pour tous les utilisateurs**. Irréversible.

### Intégrité des archives

Vérifie que les fichiers du NAS correspondent à l'index : « Archives intègres », ou le nombre de fichiers manquants, corrompus et orphelins. Affiche le dernier contrôle et le nombre de mails vérifiés. « Contrôle automatique chaque jour à 3 h. » ; **Lancer un contrôle** en lance un tout de suite.

En cas de problème, l'événement **Alerte d'intégrité** est notifié (voir [Notifications](notifications.md)).

### Quota API Gmail

Consommation du projet Google de l'instance, tous comptes confondus : **Unités aujourd'hui**, **Pic par utilisateur** (unités par seconde / limite), **Réponses 429 sur 24 h**.

### Tâches de tous les utilisateurs

Les 20 tâches les plus récentes de l'instance : **Tâche**, **Utilisateur**, **Statut**, **Créée**.

---

## Audit

Journal de l'instance, filtrable par **Utilisateur** (email) et par **Action** (ou **Toutes les actions**). Colonnes : **Date**, **Utilisateur**, **Action**, **Cible**.
