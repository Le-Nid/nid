# Premier lancement

## 1. Créer votre compte local

Ouvrez [http://localhost:3000](http://localhost:3000).

Cliquez sur **Créer un compte**, saisissez votre email et un mot de passe (min. 8 caractères).

!!! note
    Ce compte est local à l'application (stocké dans PostgreSQL). Il n'a pas de lien avec votre compte Google.

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
