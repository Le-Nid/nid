# Premiers pas

Ce guide vous accompagne dans vos premières minutes avec Nid.

---

## Créer votre compte

Ouvrez l'application dans votre navigateur (par défaut : [http://localhost:3000](http://localhost:3000)). L'écran de connexion a deux onglets : **Connexion** et **Créer un compte**.

### Compte local

1. Ouvrez l'onglet **Créer un compte**
2. Saisissez votre email et un mot de passe (8 caractères minimum)
3. Validez avec **Créer un compte**

### Connexion via un fournisseur

Si l'administrateur les a configurés, des boutons **Se connecter avec Google** (ou Microsoft, Discord, Facebook, LinkedIn, **Se connecter via SSO**) apparaissent sous le formulaire. Votre nom et votre avatar sont récupérés automatiquement.

::: tip Fusion de comptes
Si vous créez d'abord un compte local puis vous connectez avec Google en utilisant le même email, les deux comptes sont automatiquement fusionnés.
:::

Si la [2FA](settings.md#securite) est activée, un écran **Vérification en deux étapes** demande ensuite le code à 6 chiffres de votre application d'authentification.

---

## Devenir administrateur

Le premier utilisateur doit être promu administrateur. Trois options :

### Option A — Automatiquement (recommandé)

Avant de créer votre compte, ajoutez dans le fichier `.env` :

```bash
ADMIN_EMAIL=votre@email.com
```

L'utilisateur qui s'inscrit avec cet email obtient automatiquement le rôle admin.

### Option B — En base de données

Si votre compte existe déjà :

```bash
docker compose exec postgres psql -U gmailmanager -d gmailmanager \
  -c "UPDATE users SET role = 'admin' WHERE email = 'votre@email.com';"
```

Déconnectez-vous puis reconnectez-vous pour que le nouveau rôle prenne effet.

### Option C — Via l'interface

Un administrateur existant peut changer le **Rôle** d'un utilisateur depuis [Admin › Utilisateurs](admin.md#utilisateurs).

---

## Connecter un compte Gmail

Tant qu'aucun compte Gmail n'est connecté, la Vue d'ensemble affiche « Aucun compte Gmail connecté » avec le lien **Connecter un compte Gmail**.

1. Allez dans **Paramètres › Comptes Gmail** (sur mobile : **Plus › Comptes Gmail**)
2. Cliquez sur **Ajouter un compte Gmail**
3. Autorisez l'accès dans la fenêtre Google (accès demandés : `gmail.modify`, `gmail.labels`)
4. De retour dans Nid, un message confirme « Compte Gmail connecté : … »

::: warning Écran d'avertissement Google
Si votre projet Google Cloud est en mode "Test", un écran d'avertissement apparaîtra. Cliquez sur **Paramètres avancés** → **Accéder à nid (non sécurisé)**. C'est normal pour un usage personnel self-hosted.
:::

Répétez l'opération pour d'autres comptes, dans la limite fixée par l'administrateur (affichée « N / max comptes »). Le compte actif se choisit dans le sélecteur **Compte Gmail** de la barre latérale (sur mobile : menu de l'avatar). Toutes les pages affichent les données de ce compte.

---

## Votre premier nettoyage

1. Ouvrez **Nettoyage** et cliquez sur **Analyser la boîte** : Nid regroupe par expéditeur vos newsletters et mails de listes de diffusion (l'analyse tourne en arrière-plan, vous pouvez quitter la page).
2. Triez par **Taille** ou **Jamais ouverts**.
3. Sur un expéditeur, cliquez sur **Tout supprimer** : ses mails partent vers la corbeille Gmail.
4. Un toast « Suppression de N mails dans 10 s » apparaît avec **Annuler** : vous avez 10 secondes pour changer d'avis.

Le détail est dans [Nettoyage](cleanup.md). Pour agir sur n'importe quelle recherche Gmail, voir [Mails](mails.md).

::: tip Corbeille Gmail
« Supprimer » envoie les mails dans la **corbeille Gmail**, où Gmail les garde 30 jours avant de les effacer.
:::

---

## Votre première sauvegarde sur le NAS

1. Dans **Mails**, faites une recherche (ex. : `older_than:1y`)
2. Cliquez sur **Tout sauvegarder sur le NAS** (ou sélectionnez des mails puis **Sauvegarder sur le NAS**)
3. La progression s'affiche sur la page et dans [Activité](activity.md)

Les mails sauvegardés se retrouvent dans [Archives](archives.md), avec une recherche plein texte. Pour une sauvegarde régulière, activez la **Sauvegarde automatique** du compte dans [Paramètres › Comptes Gmail](settings.md#comptes-gmail).

---

## Et ensuite ?

- [**Règles & libellés**](rules.md) — automatisez le tri et le nettoyage
- [**Vue d'ensemble**](overview.md) — l'état de votre compte et les suggestions
- [**Paramètres**](settings.md) — 2FA, notifications, import/export
