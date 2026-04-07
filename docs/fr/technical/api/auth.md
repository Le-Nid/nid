# API — Authentification

Toutes les routes protégées nécessitent un header `Authorization: Bearer <token>`.

---

## Auth locale (JWT)

### POST /api/auth/register

Créer un compte local.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

**Réponse 201**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

**Erreurs**

| Code | Description |
|---|---|
| 409 | Email déjà enregistré |
| 400 | Validation échouée (email invalide, password < 8 chars) |

---

### POST /api/auth/login

Se connecter.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

Si la 2FA est activée, le serveur retourne une erreur `403` avec `TOTP_REQUIRED`. Il faut renvoyer la requête avec le champ `totpCode` :

```json
{ "email": "user@example.com", "password": "motdepasse123", "totpCode": "123456" }
```

**Réponse 200**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

**Erreurs**

| Code | Description |
|---|---|
| 401 | Credentials invalides ou code TOTP invalide |
| 403 | Compte désactivé ou `TOTP_REQUIRED` (2FA requise) |

---

### GET /api/auth/me 🔒

Récupérer le profil utilisateur et les comptes Gmail associés.

**Réponse 200**
```json
{
  "user": {
    "id": "uuid", "email": "user@example.com", "role": "user",
    "display_name": "John Doe", "avatar_url": "https://...",
    "max_gmail_accounts": 3, "storage_quota_bytes": 5368709120,
    "created_at": "..."
  },
  "gmailAccounts": [
    { "id": "uuid", "email": "compte@gmail.com", "is_active": true, "created_at": "..." }
  ],
  "storageUsedBytes": 1073741824
}
```

Le champ `totp_enabled` est inclus dans l'objet `user` pour savoir si la 2FA est active.
```

---

## Google SSO

### GET /api/auth/google

Obtenir l'URL de connexion Google SSO (inscription ou connexion).

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### GET /api/auth/google/callback

Callback Google SSO. Redirige vers `{FRONTEND_URL}/login?token=...&user=...` en cas de succès, ou `{FRONTEND_URL}/login?google=error` en cas d'erreur.
```

---

## OAuth2 Gmail

### GET /api/auth/gmail/connect 🔒

Générer l'URL d'autorisation Google.

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

Le frontend redirige l'utilisateur vers cette URL. Google redirige ensuite vers `/api/auth/gmail/callback`.

---

### GET /api/auth/gmail/callback

Callback OAuth2 Google (ne pas appeler directement).

Google redirige vers ce endpoint après autorisation. Il :
1. Échange le code contre des tokens
2. Récupère l'email du compte Google
3. Stocke les tokens en base
4. Redirige vers le frontend : `{FRONTEND_URL}/settings?gmail=connected&account=...`

---

### DELETE /api/auth/gmail/:accountId 🔒

Déconnecter un compte Gmail.

---

## 2FA / TOTP

### POST /api/auth/2fa/setup 🔒

Générer un secret TOTP et un QR code pour configurer la 2FA.

**Réponse 200**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrDataUrl": "data:image/png;base64,..."
}
```

Le QR code encode l'URI `otpauth://totp/Gmail%20Manager:user@email.com?secret=...&issuer=Gmail%20Manager`.

### POST /api/auth/2fa/enable 🔒

Vérifier un code TOTP et activer la 2FA.

**Body**
```json
{ "token": "123456" }
```

**Réponse 200**
```json
{ "success": true }
```

**Erreurs**

| Code | Description |
|---|---|
| 400 | 2FA déjà activé, setup non effectué, ou code invalide |

### POST /api/auth/2fa/disable 🔒

Désactiver la 2FA (nécessite un code TOTP valide).

**Body**
```json
{ "token": "123456" }
```

**Réponse 200**
```json
{ "success": true }
```

**Erreurs**

| Code | Description |
|---|---|
| 400 | 2FA non activée ou code invalide |

::: warning Google SSO et 2FA
La 2FA ne s'applique qu'aux comptes avec mot de passe local. Les utilisateurs connectés via Google SSO sont protégés par la 2FA de Google.
:::

**Réponse 204** — No content

!!! note
    Les archives existantes de ce compte **ne sont pas supprimées** lors de la déconnexion.
