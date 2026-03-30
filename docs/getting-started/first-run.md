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

---

## Activer la 2FA (authentification à deux facteurs)

Si vous utilisez un compte local (email + mot de passe), vous pouvez sécuriser votre accès avec un code TOTP :

1. Dans **Paramètres**, section **Authentification à deux facteurs**
2. Cliquez sur **Configurer la 2FA**
3. Scannez le QR code avec votre app d'authentification (Google Authenticator, Authy, etc.)
4. Entrez le code à 6 chiffres affiché par l'app
5. Cliquez sur **Vérifier et activer**

Lors de vos prochaines connexions, un champ TOTP sera demandé après l'email/mot de passe.

!!! info "Google SSO et 2FA"
    La 2FA ne s'applique qu'aux comptes locaux. Les utilisateurs Google SSO sont déjà protégés par la 2FA de Google.

---

## Templates de règles

Pour créer rapidement des règles de nettoyage :

1. Dans **Règles**, cliquez sur **Templates**
2. Parcourez les modèles par catégorie (Nettoyage, Archive, Organisation)
3. Cliquez sur **Utiliser** sur un template
4. La règle est créée et activable immédiatement

Exemples : "Nettoyer notifs GitHub", "Archiver factures > 3 mois", "Supprimer newsletters non lues > 30j".

---

## Scanner les newsletters (Unsubscribe)

1. Dans **Désabonnement**, cliquez sur **Scanner** sur un de vos comptes Gmail
2. L'app analyse les headers `List-Unsubscribe` de vos mails récents
3. Vous voyez la liste des newsletters/listes de diffusion avec leur volume et taille
4. Cliquez sur **Se désabonner** pour envoyer une demande de désabonnement
5. Utilisez **Supprimer** pour nettoyer en masse les anciens mails de cette liste

---

## Gérer les pièces jointes

La page **Pièces jointes** centralise toutes les PJ :

- **Archives** : PJ des mails archivés sur votre NAS
- **Gmail** : PJ des mails encore dans votre boîte Gmail

Triez par taille pour identifier les fichiers volumineux et téléchargez-les directement.

---

## Détecter les doublons

1. Dans **Doublons**, les archives sont automatiquement analysées
2. Les mails identiques (même sujet + expéditeur + date) sont regroupés
3. Cliquez sur **Supprimer N** pour ne garder que le plus récent de chaque groupe

---

## Journal d'activité

Dans **Paramètres**, la section **Journal d'activité** affiche vos actions récentes : connexions, créations de règles, opérations bulk, etc. Utile pour vérifier l'activité sur votre compte.

---

## Insights & rapport hebdomadaire

La page **Insights** affiche un rapport hebdomadaire de votre activité Gmail :

- Nombre de mails reçus, archivés et supprimés
- Top expéditeurs de la semaine
- Règles exécutées et espace libéré
- Évolution semaine par semaine

Le rapport est aussi généré automatiquement chaque lundi et envoyé comme notification in-app.

---

## Notifications

L'icône **🔔** dans le header affiche vos notifications :

- Rapports hebdomadaires générés
- Jobs terminés ou en échec
- Alertes système (quota, erreurs)

Le badge rouge indique le nombre de notifications non lues. Cliquez sur une notification pour la marquer comme lue, ou utilisez **Tout marquer comme lu**.

### Préférences de notifications

Dans **Paramètres**, la carte **Préférences de notifications** affiche un tableau où vous choisissez, pour chaque type de notification, les canaux actifs :

| Notification | 🔔 In-app | 💬 Toast | 🔗 Webhook |
|---|---|---|---|
| Rapport hebdomadaire | ✅ | ❌ | — |
| Job terminé | ✅ | ✅ | `job.completed` |
| Job en échec | ✅ | ✅ | `job.failed` |
| Règle exécutée | ❌ | ❌ | `rule.executed` |
| Alerte quota | ✅ | ❌ | `quota.warning` |
| Alerte intégrité | ✅ | ❌ | `integrity.failed` |

- **🔔 In-app** : crée une notification dans la cloche du header
- **💬 Toast** : affiche une pop-up temporaire en bas de page
- **🔗 Webhook** : push vers Discord, Slack, Ntfy ou endpoint HTTP (configurés dans la carte Webhooks)

La colonne Webhook affiche le nombre de webhooks actifs pour chaque événement. Les trois canaux sont indépendants — vous pouvez activer in-app sans toast, ou uniquement le webhook.

Chaque toggle prend effet immédiatement — aucune sauvegarde manuelle nécessaire.

---

## Vérification d'intégrité des archives

Les administrateurs peuvent vérifier la cohérence entre les fichiers EML archivés sur le NAS et l'index PostgreSQL :

1. Rendez-vous dans **Administration** (menu sidebar, réservé aux admins)
2. La vérification détecte automatiquement :
    - **Fichiers manquants** : référencés en BDD mais absents du disque
    - **Fichiers orphelins** : présents sur disque sans enregistrement en BDD
    - **Fichiers corrompus** : fichiers vides (0 octets)
3. Le résultat indique si l'archive est **saine** ou non

!!! info "Vérification automatique"
    Une vérification est exécutée automatiquement chaque nuit à 3h du matin. En cas de problème, un événement webhook `integrity.failed` est déclenché.

---

## Webhooks / notifications externes

Recevez des notifications sur vos services préférés quand un événement survient :

1. Dans **Paramètres**, section **Webhooks**
2. Cliquez sur **Ajouter un webhook**
3. Configurez :
    - **Nom** : identifiant libre
    - **URL** : endpoint de votre service (Discord, Slack, Ntfy ou URL générique)
    - **Type** : `discord`, `slack`, `ntfy` ou `generic`
    - **Événements** : choisissez parmi `job.completed`, `job.failed`, `rule.executed`, `quota.warning`, `integrity.failed`
4. Cliquez sur **Tester** pour vérifier la connectivité

!!! tip "Signature HMAC"
    Les webhooks de type `generic` incluent un header `X-Webhook-Signature` (HMAC-SHA256) pour vérifier l'authenticité des requêtes.

---

## Raccourcis clavier

La page **Mes mails** supporte des raccourcis clavier pour naviguer et agir rapidement :

| Touche | Action |
|---|---|
| `j` | Mail suivant |
| `k` | Mail précédent |
| `Entrée` / `o` | Ouvrir le mail sélectionné |
| `e` | Archiver |
| `#` | Supprimer (corbeille) |
| `r` | Marquer comme lu |
| `u` | Marquer comme non lu |
| `/` | Focus sur la barre de recherche |
| `Échap` | Désélectionner |

Les raccourcis sont désactivés automatiquement quand vous tapez dans un champ de saisie. Un bandeau en bas de la page rappelle les touches disponibles.

---

## Export / import de configuration

Sauvegardez et restaurez vos règles et webhooks au format JSON :

### Exporter

1. Dans **Paramètres**, section **Export / Import**
2. Cliquez sur **Exporter**
3. Un fichier `gmail-manager-config.json` est téléchargé

Le fichier contient vos règles (par compte Gmail) et vos webhooks, sans données sensibles (tokens, secrets).

### Importer

1. Cliquez sur **Importer**
2. Sélectionnez un fichier JSON précédemment exporté
3. Les règles sont associées à vos comptes Gmail par email
4. Les webhooks sont importés directement

!!! warning "Import additif"
    L'import ajoute les éléments sans supprimer les existants. Importez plusieurs fois le même fichier créera des doublons.
