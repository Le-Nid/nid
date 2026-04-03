# Configuration Google Cloud

Guide pas à pas pour configurer les credentials OAuth2 nécessaires à Nid.

---

## 1. Créer un projet Google Cloud

1. Rendez-vous sur [console.cloud.google.com](https://console.cloud.google.com)
2. Cliquez sur le sélecteur de projet en haut → **Nouveau projet**
3. Nommez-le (ex. `nid`) et cliquez sur **Créer**

---

## 2. Activer l'API Gmail

1. Dans le menu latéral : **APIs & Services** → **Bibliothèque**
2. Recherchez **Gmail API**
3. Cliquez sur **Activer**

---

## 3. Configurer l'écran de consentement OAuth

1. **APIs & Services** → **Écran de consentement OAuth**
2. Choisissez le type :
    - **Interne** : si vous avez un compte Google Workspace (pas d'écran d'avertissement)
    - **Externe** : pour les comptes Gmail personnels (nécessite des utilisateurs de test)
3. Renseignez :
    - Nom de l'application : `Nid`
    - Email d'assistance : votre email
    - Domaine autorisé : votre domaine (ou laissez vide pour localhost)
4. Ajoutez les **scopes** :
    - `https://www.googleapis.com/auth/gmail.modify`
    - `https://www.googleapis.com/auth/gmail.labels`
    - `https://www.googleapis.com/auth/userinfo.email`
    - `https://www.googleapis.com/auth/userinfo.profile`
5. Si **Externe** : ajoutez votre email en tant qu'**utilisateur de test**

!!! warning "Application en mode Test"
    Tant que l'application est en mode "Test", Google affichera un écran d'avertissement lors de la connexion. C'est normal pour un usage personnel. Cliquez sur **Paramètres avancés** → **Accéder à nid (non sécurisé)** pour continuer.

---

## 4. Créer les credentials OAuth2

1. **APIs & Services** → **Identifiants** → **Créer des identifiants** → **ID client OAuth 2.0**
2. Type d'application : **Application Web**
3. Nom : `Nid`
4. Ajoutez **deux** URIs de redirection autorisées :

```
http://localhost:3000/api/auth/gmail/callback
http://localhost:3000/api/auth/google/callback
```

| URI | Rôle |
|---|---|
| `/api/auth/gmail/callback` | Connexion d'un compte Gmail à l'application (OAuth2 Gmail) |
| `/api/auth/google/callback` | Inscription / connexion via Google SSO |

!!! tip "Domaine personnalisé"
    Si vous exposez l'application sur un domaine (ex. `https://gmail.monnas.fr`), remplacez `http://localhost:3000` par votre URL publique dans les URIs de callback **et** dans la variable `FRONTEND_URL` du `.env`.

5. Cliquez sur **Créer**
6. Notez le **Client ID** et le **Client Secret** → à reporter dans votre `.env`

---

## 5. Reporter dans le `.env`

```bash
GOOGLE_CLIENT_ID=123456789-xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

Les URIs de callback sont dérivées automatiquement de `FRONTEND_URL` en Docker production. En développement, définissez-les explicitement :

```bash
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/gmail/callback
GOOGLE_SSO_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

---

## Résolution de problèmes

### Erreur `redirect_uri_mismatch`

L'URI de callback configurée dans Google Cloud ne correspond pas exactement à celle utilisée par l'application. Vérifiez :

- Le protocole (`http` vs `https`)
- Le port (`3000` en prod, `4000` en dev)
- Le path exact (pas de `/` en trop)

### Erreur `invalid_client`

Le Client ID ou Client Secret est incorrect. Vérifiez vos variables `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.

### L'écran d'avertissement Google apparaît

C'est normal si l'application est en mode "Test". Pour un usage personnel self-hosted, vous pouvez ignorer cet avertissement. Pour le supprimer, publiez votre application Google Cloud (nécessite une vérification OAuth par Google).

### Le refresh token n'est pas reçu

Google ne retourne le `refresh_token` qu'au **premier** consentement. Si vous reconnectez un compte Gmail déjà autorisé :

1. Allez sur [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. Révoquez l'accès de Nid
3. Reconnectez le compte — le refresh token sera émis à nouveau
