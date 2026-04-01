# Premiers pas

Ce guide vous accompagne dans vos premières minutes avec Gmail Manager.

---

## Créer votre compte

Ouvrez l'application dans votre navigateur (par défaut : [http://localhost:3000](http://localhost:3000)).

Deux options de création de compte s'offrent à vous :

### Compte local

1. Cliquez sur **Créer un compte**
2. Saisissez votre email et un mot de passe (minimum 8 caractères)
3. Cliquez sur **S'inscrire**

### Connexion avec Google (SSO)

1. Cliquez sur **Se connecter avec Google**
2. Choisissez votre compte Google
3. Autorisez l'accès

Votre nom et avatar Google sont récupérés automatiquement.

> 📸 *Capture d'écran suggérée : page de login avec les deux options (formulaire + bouton Google SSO)*

!!! tip "Fusion de comptes"
    Si vous créez d'abord un compte local puis vous connectez avec Google en utilisant le même email, les deux comptes sont automatiquement fusionnés.

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

Un administrateur existant peut promouvoir d'autres utilisateurs depuis **Administration** → **Utilisateurs** → **Modifier le rôle**.

!!! info "Différence entre les rôles"
    - **Utilisateur** : accès complet à ses propres données (mails, archives, règles, etc.)
    - **Administrateur** : accès aux données de tous les utilisateurs + gestion des quotas et des rôles

---

## Connecter un compte Gmail

Une fois connecté, vous devez lier votre boîte Gmail pour que l'application puisse y accéder.

1. Rendez-vous dans **Paramètres** (icône ⚙️ dans la sidebar)
2. Dans la section **Comptes Gmail**, cliquez sur **Connecter un compte Gmail**
3. Google vous demande d'autoriser trois types d'accès :
    - Lecture et modification de vos mails
    - Gestion de vos labels
    - Lecture de votre adresse email
4. Cliquez sur **Autoriser**
5. Vous êtes redirigé vers les Paramètres avec une confirmation

> 📸 *Capture d'écran suggérée : page Paramètres avec le bouton "Connecter un compte Gmail" et la liste des comptes connectés*

!!! warning "Écran d'avertissement Google"
    Si votre projet Google Cloud est en mode "Test", un écran d'avertissement apparaîtra. Cliquez sur **Paramètres avancés** → **Accéder à gmail-manager (non sécurisé)**. C'est normal pour un usage personnel self-hosted.

### Ajouter d'autres comptes Gmail

Répétez l'opération pour connecter d'autres comptes. Vous pouvez gérer jusqu'à 5 comptes par défaut (configurable par l'administrateur).

Chaque compte apparaît dans le **sélecteur de compte** en haut de la sidebar. Sélectionnez un compte pour afficher ses données dans toutes les sections de l'application.

> 📸 *Capture d'écran suggérée : sélecteur de compte Gmail dans la sidebar avec plusieurs comptes listés*

---

## Découvrir le Dashboard

Après avoir connecté votre Gmail, le **Dashboard** charge automatiquement les statistiques de votre boîte :

- **Top expéditeurs** : qui vous envoie le plus de mails et occupe le plus d'espace
- **Mails les plus volumineux** : identifiez rapidement les mails à supprimer en priorité
- **Timeline** : évolution du volume de mails par mois
- **Répartition des labels** : distribution de vos labels Gmail

> 📸 *Capture d'écran suggérée : page Dashboard complète avec les 4 graphiques*

Le chargement initial peut prendre quelques secondes selon la taille de votre boîte.

---

## Votre première opération de nettoyage

Essayez une première opération de suppression en masse :

1. Ouvrez **Mes mails** dans la sidebar
2. Utilisez la barre de recherche pour filtrer (ex. : `from:newsletter@example.com`)
3. Cochez la case en tête du tableau pour sélectionner tous les résultats
4. Cliquez sur **Supprimer (corbeille)** dans la barre d'actions
5. Un **job** est créé — une fenêtre modale affiche la progression en temps réel

> 📸 *Capture d'écran suggérée : page Mes mails avec des mails sélectionnés et la barre d'actions en masse visible*

> 📸 *Capture d'écran suggérée : modale de progression d'un job avec barre de progression*

!!! tip "Corbeille vs suppression définitive"
    La suppression envoie les mails à la **corbeille Gmail** (récupérables pendant 30 jours). La suppression définitive est irréversible — utilisez-la avec précaution.

---

## Votre premier archivage

Pour sauvegarder des mails sur votre NAS :

1. Dans **Mes mails**, filtrez les mails à archiver
2. Sélectionnez-les ou cliquez sur **Tout archiver** pour archiver tous les résultats
3. Un job d'archivage est créé
4. Les fichiers EML sont sauvegardés dans le dossier d'archives

Consultez ensuite la section **Archives** pour retrouver vos mails archivés avec la recherche full-text.

> 📸 *Capture d'écran suggérée : section Archives avec la barre de recherche et la liste des mails archivés*

---

## Et ensuite ?

Maintenant que vous êtes opérationnel, explorez les autres fonctionnalités :

- [**Règles automatiques**](rules.md) — automatisez le nettoyage récurrent
- [**Newsletters**](newsletters.md) — identifiez et nettoyez les newsletters en masse
- [**Analytics**](analytics.md) — comprenez vos habitudes email
- [**Paramètres**](settings.md) — activez la 2FA, configurez les webhooks, changez la langue
