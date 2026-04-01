# Paramètres

La page **Paramètres** centralise la configuration de votre compte, la sécurité, les webhooks et les préférences.

---

## Profil

La section profil affiche vos informations :

- **Email** : votre adresse email de connexion
- **Nom d'affichage** : modifiable (récupéré automatiquement depuis Google SSO)
- **Avatar** : récupéré depuis Google SSO le cas échéant
- **Rôle** : Utilisateur ou Administrateur

---

## Comptes Gmail connectés

Liste de tous vos comptes Gmail liés à Gmail Manager :

- Email de chaque compte
- Statut de la connexion (actif / inactif)
- Bouton **Connecter un compte Gmail** pour en ajouter un nouveau
- Bouton **Déconnecter** pour retirer un compte

> 📸 *Capture d'écran suggérée : section Comptes Gmail avec la liste des comptes et les boutons connecter/déconnecter*

---

## Authentification à deux facteurs (2FA)

!!! info "Comptes locaux uniquement"
    La 2FA ne s'applique qu'aux comptes locaux (email + mot de passe). Les utilisateurs Google SSO sont protégés par la 2FA de Google.

### Activer la 2FA

1. Cliquez sur **Configurer la 2FA**
2. Un **QR code** s'affiche
3. Scannez-le avec votre application d'authentification (Google Authenticator, Authy, Microsoft Authenticator, etc.)
4. Saisissez le code à 6 chiffres affiché par l'app
5. Cliquez sur **Vérifier et activer**

> 📸 *Capture d'écran suggérée : QR code de configuration 2FA avec le champ de vérification du code*

### Connexion avec 2FA

Lors de la connexion, après avoir saisi votre email et mot de passe, un champ supplémentaire demande le code TOTP de votre application d'authentification.

### Désactiver la 2FA

Cliquez sur **Désactiver la 2FA** et confirmez en saisissant un code TOTP valide.

---

## Préférences de notifications

Tableau permettant de choisir, pour chaque type de notification, les canaux actifs (in-app et toast). Voir la page [Notifications](notifications.md#préférences-de-notifications) pour les détails.

---

## Webhooks

Configuration des webhooks sortants. Voir la page [Notifications — Webhooks](notifications.md#webhooks) pour les détails.

---

## Export / Import de configuration

Sauvegardez et restaurez votre configuration (règles et webhooks) au format JSON.

### Exporter

1. Cliquez sur **Exporter**
2. Un fichier `gmail-manager-config.json` est téléchargé

Le fichier contient vos règles (associées par email de compte Gmail) et vos webhooks. Les données sensibles (tokens, secrets) ne sont **pas** incluses.

### Importer

1. Cliquez sur **Importer**
2. Sélectionnez un fichier JSON précédemment exporté
3. Les règles sont associées à vos comptes Gmail par correspondance d'email
4. Les webhooks sont importés directement

> 📸 *Capture d'écran suggérée : section Export/Import avec les boutons Exporter et Importer*

!!! warning "Import additif"
    L'import **ajoute** les éléments sans supprimer les existants. Importer plusieurs fois le même fichier créera des doublons.

---

## Journal d'activité (Audit log)

La section **Journal d'activité** affiche vos dernières actions dans l'application :

- Connexions et déconnexions
- Créations, modifications et suppressions de règles
- Opérations bulk (suppression, archivage)
- Exports et imports de configuration

> 📸 *Capture d'écran suggérée : journal d'activité avec les actions, dates et détails*

---

## Langue

Le sélecteur de langue est situé dans la **barre de navigation** (en haut), à côté de la cloche de notifications.

Langues disponibles :

- 🇫🇷 Français (par défaut)
- 🇬🇧 Anglais

Le choix est persisté dans le navigateur et conservé entre les sessions.

---

## Thème

Le toggle **thème sombre / clair** est situé dans la barre de navigation, à côté du sélecteur de langue. Le choix est persisté dans le navigateur.
