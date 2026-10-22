# API — Authentification

L'authentification repose sur un JWT posé dans le cookie httpOnly `token` (durée 24 h, `SameSite=strict`). Un header `Authorization: Bearer <token>` est aussi accepté. Les routes marquées 🔒 exigent ce JWT ; un JWT révoqué (logout) ou un utilisateur désactivé renvoie `401`.

---

## Configuration publique

### GET /api/auth/config

Indique au frontend les modes de connexion disponibles. Public.

**Réponse 200**
```json
{ "allowRegistration": true, "googleSsoEnabled": true, "socialProviders": ["google", "microsoft"] }
```

---

## Auth locale (JWT)

### POST /api/auth/register

Créer un compte local. Rate limit : 3 requêtes / minute. L'adresse égale à `ADMIN_EMAIL` reçoit le rôle `admin`.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

`password` : 8 à 128 caractères.

**Réponse 201** — le JWT est posé dans le cookie.
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

**Erreurs**

| Code | Description |
|---|---|
| 400 | Validation échouée (email invalide, password < 8 caractères) |
| 403 | Inscription désactivée (`ALLOW_REGISTRATION=false`) |
| 409 | Email déjà enregistré |

---

### POST /api/auth/login

Se connecter. Rate limit : 5 requêtes / minute.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

Si la 2FA est activée, le serveur retourne `403` avec `{ "error": "TOTP_REQUIRED" }`. Il faut renvoyer la requête avec le champ `totpCode` (6 chiffres) :

```json
{ "email": "user@example.com", "password": "motdepasse123", "totpCode": "123456" }
```

**Réponse 200** — le JWT est posé dans le cookie.
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

**Erreurs**

| Code | Description |
|---|---|
| 401 | Identifiants invalides, compte désactivé ou code TOTP invalide (message unique, pas d'énumération) |
| 403 | `TOTP_REQUIRED` (2FA requise) |

---

### POST /api/auth/logout 🔒

Révoque le JWT courant (liste noire Redis jusqu'à son expiration) et efface le cookie.

**Réponse 204** — No content

---

### POST /api/auth/refresh 🔒

Réémet un JWT neuf (cookie) sans se reconnecter.

**Réponse 200**
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

---

### GET /api/auth/me 🔒

Récupérer le profil utilisateur et les comptes Gmail associés.

**Réponse 200**
```json
{
  "user": {
    "id": "uuid", "email": "user@example.com", "role": "user",
    "display_name": "John Doe", "avatar_url": "https://...", "is_active": true,
    "max_gmail_accounts": 3, "storage_quota_bytes": 5368709120,
    "totp_enabled": false, "created_at": "..."
  },
  "gmailAccounts": [
    {
      "id": "uuid", "email": "compte@gmail.com", "is_active": true, "created_at": "...",
      "backup_enabled": false, "backup_interval": "24h",
      "needs_reauth": false, "last_sync_at": "..."
    }
  ],
  "storageUsedBytes": 1073741824
}
```

- `needs_reauth` : Google a refusé le refresh token, le compte doit être reconnecté (« Action requise »).
- `last_sync_at` : dernière synchronisation des libellés (`null` si jamais).

---

## Google SSO

### GET /api/auth/google

Obtenir l'URL de connexion Google SSO (inscription ou connexion). Public.

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### GET /api/auth/google/callback

Callback Google SSO (ne pas appeler directement). En cas de succès, pose le cookie JWT et redirige vers `{FRONTEND_URL}/login?sso_code=<code>` ; sinon vers `{FRONTEND_URL}/login?google=error` (ou `google=disabled` si le compte est désactivé).

### POST /api/auth/google/exchange

Échange le `sso_code` (valable 60 s, usage unique) contre les infos utilisateur. Le JWT est déjà dans le cookie. Sert aussi au retour des fournisseurs sociaux.

**Body**
```json
{ "code": "<sso_code>" }
```

**Réponse 200**
```json
{ "id": "uuid", "email": "user@example.com", "role": "user" }
```

**Erreurs** : `401` code invalide ou expiré.

---

## Connexion sociale

### GET /api/auth/social/:provider/url

Obtenir l'URL d'autorisation d'un fournisseur social configuré (voir `socialProviders` dans `/api/auth/config`). Public. `provider` : `google`, `microsoft`, `discord`, `facebook`, `linkedin` ou `keycloak`.

**Réponse 200**
```json
{ "url": "https://..." }
```

**Erreurs** : `400` fournisseur non configuré.

### GET /api/auth/social/:provider/callback

Callback du fournisseur (ne pas appeler directement). Même comportement que le callback Google : redirection vers `{FRONTEND_URL}/login?sso_code=<code>`, ou `{FRONTEND_URL}/login?social=error` / `social=disabled`.

---

## OAuth2 Gmail

### GET /api/auth/gmail/connect 🔒

Générer l'URL d'autorisation Google (state JWT signé, valable 5 min).

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**Erreurs** : `403` nombre maximal de comptes Gmail atteint (`max_gmail_accounts`).

Le frontend redirige l'utilisateur vers cette URL. Google redirige ensuite vers `/api/auth/gmail/callback`.

---

### GET /api/auth/gmail/callback

Callback OAuth2 Google (ne pas appeler directement).

Google redirige vers ce endpoint après autorisation. Il :
1. Vérifie le state signé
2. Échange le code contre des tokens et stocke le compte (reconnecter une adresse existante réactive son compte)
3. Lance une première synchronisation des libellés en arrière-plan
4. Redirige vers `{FRONTEND_URL}/settings/gmail?gmail=connected&account=...` (ou `?gmail=error`)

---

### DELETE /api/auth/gmail/:accountId 🔒

Déconnexion douce d'un compte Gmail : les tokens sont effacés et le compte passe inactif (plus de synchronisation ni de sauvegarde), mais il reste en base.

**Réponse 204** — No content

::: tip
Les archives de ce compte **ne sont pas supprimées** ; reconnecter la même adresse réactive le compte.
:::

---

### PATCH /api/auth/gmail/:accountId/toggle 🔒

Active / désactive un compte Gmail.

**Réponse 200**
```json
{ "id": "uuid", "is_active": false }
```

**Erreurs** : `404` compte introuvable ; `409` compte déconnecté (plus de token) : il faut le reconnecter.

---

### PATCH /api/auth/gmail/:accountId 🔒

Réglages du compte Gmail (sauvegarde automatique NAS).

**Body** (au moins un champ)
```json
{ "backup_enabled": true, "backup_interval": "6h" }
```

`backup_interval` : `1h`, `6h` ou `24h`.

**Réponse 200**
```json
{ "id": "uuid", "backup_enabled": true, "backup_interval": "6h" }
```

**Erreurs** : `400` body invalide ou vide ; `404` compte introuvable.

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

Le QR code encode l'URI `otpauth://totp/Nid:user@email.com?secret=...&issuer=Nid`. Si la 2FA est déjà active, la réponse est `200` avec `{ "error": "2FA is already enabled" }`.

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
| 400 | 2FA déjà activée, setup non effectué, ou code invalide |

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
