# Premier lancement

## 1. Créer votre compte

Ouvrez [http://localhost:3000](http://localhost:3000).

Deux options s'offrent à vous :

- **Compte local** : cliquez sur **Créer un compte**, saisissez votre email et un mot de passe (min. 8 caractères).
- **Google SSO** : cliquez sur **Se connecter avec Google** pour utiliser votre compte Google existant. Aucun mot de passe n'est nécessaire.

!!! tip "Google SSO"
    Si vous utilisez Google SSO, votre nom et avatar Google seront récupérés automatiquement. Vous pouvez ensuite connecter vos comptes Gmail dans les Paramètres.

!!! note
    Le compte local est stocké dans PostgreSQL. Le compte Google SSO est lié via votre `google_id` — si vous avez déjà un compte local avec le même email, il sera fusionné.

---

## 2. Devenir administrateur

Le premier administrateur doit être configuré de l'une de ces façons :

### Option A — Variable `ADMIN_EMAIL` (recommandé)

Dans votre `.env`, définissez `ADMIN_EMAIL=votre@email.com` **avant** de créer votre compte. L'utilisateur qui s'inscrit avec cet email obtient automatiquement le rôle `admin`.

### Option B — Promotion manuelle en SQL

Si votre compte existe déjà avec le rôle `user` :

```bash
docker compose exec postgres psql -U gmailmanager -d gmailmanager \
  -c "UPDATE users SET role = 'admin' WHERE email = 'votre@email.com';"
```

Déconnectez-vous puis reconnectez-vous pour que le JWT soit regénéré avec le rôle `admin`.

### Option C — Via la page Admin

Un administrateur existant peut promouvoir d'autres utilisateurs depuis **Administration** → onglet **Utilisateurs** → **Modifier**.

!!! info "Rôles"
    - **user** (défaut) : accès complet à ses propres données (mails, archives, règles, jobs).
    - **admin** : idem + accès à la page Administration (vue globale des utilisateurs, jobs de tous les users, gestion des quotas et des rôles).

---

## 2. Connecter un compte Gmail

Rendez-vous dans **Paramètres** (icône ⚙️ dans la sidebar).

Cliquez sur **Connecter un compte Gmail**.

Vous êtes redirigé vers Google pour autoriser les scopes :

- `gmail.modify` — lecture, labels, suppression (corbeille)
- `gmail.labels` — gestion des labels
- `userinfo.email` — récupérer votre adresse email

!!! warning "Popup de sécurité Google"
    Si votre application est en mode "Test" dans Google Cloud, Google affichera un écran d'avertissement. Cliquez sur "Paramètres avancés" → "Accéder à gmail-manager (non sécurisé)" pour continuer.
    
    Pour supprimer cet avertissement, publiez votre application Google Cloud (vérification OAuth).

Après autorisation, vous êtes redirigé vers Paramètres avec une confirmation.

---

## 3. Découvrir le Dashboard

Le Dashboard charge automatiquement les statistiques de votre boîte (peut prendre quelques secondes selon la taille de la boîte) :

- **Top expéditeurs** — classés par nombre de mails et par taille totale
- **Mails les plus gros** — pour identifier rapidement les mails à supprimer
- **Timeline** — évolution du volume par mois
- **Répartition labels** — pour voir la distribution de vos labels Gmail

---

## 4. Première opération bulk

Dans **Mes mails** :

1. Filtrez par expéditeur (ex. : `newsletter@`)
2. Sélectionnez tous les résultats (case en-tête du tableau)
3. Cliquez sur **Supprimer (corbeille)**
4. Un job est créé — suivez sa progression dans **Jobs**

!!! tip "Suppression définitive"
    Par défaut, la suppression envoie les mails à la corbeille Gmail (récupérable 30 jours). La suppression définitive est disponible via le bouton "Supprimer définitivement" et est irréversible.

---

## 5. Première archive

Dans **Mes mails** :

1. Sélectionnez les mails à archiver
2. Cliquez sur **Archiver sur NAS**
3. Un job d'archivage est créé — les EML sont écrits dans `/archives/{account_id}/{année}/{mois}/`

Consultez vos archives dans la section **Archives** — recherche full-text disponible.

---

## Ajouter un second compte Gmail

Dans **Paramètres**, cliquez à nouveau sur **Connecter un compte Gmail**.

Vous pouvez switcher entre vos comptes via le sélecteur dans la sidebar.
