# API — Authentification

L'authentification repose sur un JWT posé dans le cookie httpOnly `token` (durée 24 h, `SameSite=strict`). Un header `Authorization: Bearer <token>` est aussi accepté. Les routes marquées 🔒 exigent ce JWT ; un JWT révoqué (logout) ou un utilisateur désactivé renvoie `401`.

---

## Configuration publique

### GET /api/auth/config

Indique au frontend les modes de connexion disponibles. Public.

**Réponse 200**
```json
{ "allowRegistration": true, "googleSsoEnabled": true, "passwordResetEnabled": false, "socialProviders": ["google", "microsoft"] }
```

`passwordResetEnabled` : SMTP configuré (`SMTP_URL`), « Mot de passe oublié » disponible.

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

### POST /api/auth/password/forgot

Envoie par e-mail un lien `FRONTEND_URL/reset-password?token=…`, valable 1 heure. Public, rate limit 3/min par IP et au plus un e-mail par compte et par minute.

```json
{ "email": "user@example.com" }
```

**Réponse 204** dans tous les cas (adresse inconnue, compte SSO uniquement ou désactivé : aucun e-mail), et l'envoi n'est pas attendu : ni la réponse ni sa durée ne révèlent si un compte existe. `404` si `SMTP_URL` n'est pas configuré. Le token est stocké dans Redis sous son SHA-256.

---

### POST /api/auth/password/reset

Choisit le nouveau mot de passe avec le token de l'e-mail (usage unique). Révoque toutes les sessions et n'en ouvre pas : l'utilisateur se reconnecte, 2FA comprise. Tracé `user.password_reset`. Rate limit : 5/min.

```json
{ "token": "64 caractères hexadécimaux", "newPassword": "nouveau-8-caracteres-min" }
```

**Réponse 204**. `400` si le lien est inconnu, déjà utilisé, expiré, ou émis avant le dernier changement de mot de passe.

---

### PATCH /api/auth/password 🔒

Changer le mot de passe d'un compte local. Révoque toutes les autres sessions (`users.password_changed_at`) ; la session courante reçoit un nouveau cookie. Rate limit : 5/min.

```json
{ "currentPassword": "ancien", "newPassword": "nouveau-8-caracteres-min" }
```

**Réponse 204**. `400` si le compte n'a pas de mot de passe (SSO uniquement), `400` aussi si le mot de passe actuel est faux (pas `401`, que le frontend traduit en redirection vers `/login`).

---

### GET /api/auth/me/export 🔒

Export RGPD : toutes les données que Nid conserve sur l'utilisateur, en JSON (`Content-Disposition: attachment`). Profil, comptes sociaux et Gmail, préférences, notifications, journal d'audit, webhooks, recherches enregistrées, rétention, partages, jobs, règles, libellés, expirations, analyses, métadonnées des mails archivés et des pièces jointes. Sont exclus : les secrets (hash du mot de passe et du TOTP, tokens OAuth, identifiants des webhooks, tokens de partage) et le contenu des mails, exportable par compte en mbox/ZIP. Rate limit : 3/min.

---

### DELETE /api/auth/me 🔒

Supprime définitivement le compte : l'utilisateur, ses comptes Gmail, ses archives (lignes en base et fichiers sous `ARCHIVE_PATH/<accountId>/`), ses règles et le reste (cascade). Rien n'est supprimé dans Gmail. Rate limit : 3/min.

```json
{ "password": "..." }
```

Un compte local confirme avec `password`, un compte SSO uniquement avec `email` (son adresse). **Réponse 204** (cookie effacé). `401` si la confirmation est fausse, `409` s'il s'agit du dernier admin actif.

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
    "totp_enabled": false, "has_password": true, "created_at": "..."
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
- `has_password` : compte local avec mot de passe (`false` : SSO uniquement).

---

## Google SSO

### GET /api/auth/google

Obtenir l'URL de connexion Google SSO (inscription ou connexion). Public.

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### GET /api/auth/google/callback

Callback Google SSO (ne pas appeler directement). En cas de succès, pose le cookie JWT (sauf si la 2FA est activée, voir ci-dessous) et redirige vers `{FRONTEND_URL}/login?sso_code=<code>` ; sinon vers `{FRONTEND_URL}/login?google=error` (ou `google=disabled` si le compte est désactivé).

### POST /api/auth/google/exchange

Échange le `sso_code` (valable 60 s, usage unique) contre les infos utilisateur. Le JWT est déjà dans le cookie. Sert aussi au retour des fournisseurs sociaux. Limité à 10 requêtes/minute.

Si la 2FA est activée sur le compte, le callback ne pose **pas** le cookie : le `sso_code` reste valable 5 minutes et l'échange exige `totpCode`. Le cookie JWT n'est posé qu'après vérification du code. Après 5 codes invalides, le `sso_code` est invalidé et il faut relancer la connexion SSO.

**Body**
```json
{ "code": "<sso_code>", "totpCode": "123456" }
```

`totpCode` : optionnel, requis uniquement si la 2FA est activée.

**Réponse 200**
```json
{ "id": "uuid", "email": "user@example.com", "role": "user" }
```

**Erreurs** : `401` code invalide ou expiré, ou code TOTP invalide ; `403` `TOTP_REQUIRED` (2FA activée, `totpCode` manquant).

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

---

## Passkeys (WebAuthn)

Connexion sans mot de passe avec le code ou la biométrie de l'appareil, via `@simplewebauthn/server`. Le *relying party* est le site du frontend : `rpID` = nom d'hôte de `FRONTEND_URL`, origine attendue = `FRONTEND_URL`. Une passkey ne fonctionne donc que sur cette adresse exacte. Les passkeys sont *discoverables* (l'utilisateur ne tape pas son e-mail) et la vérification utilisateur est **obligatoire** : une passkey vérifiée est déjà multi-facteur, la 2FA TOTP n'est pas demandée en plus. Les challenges sont à usage unique, conservés 5 minutes dans Redis.

### GET /api/auth/passkeys 🔒

Liste des passkeys de l'utilisateur : `[{ "id", "name", "created_at", "last_used_at" }]`.

### POST /api/auth/passkeys/register/options 🔒

Options de création à passer à `startRegistration()` (navigateur). Les passkeys déjà enregistrées sont exclues.

### POST /api/auth/passkeys/register/verify 🔒

```json
{ "name": "iPhone", "response": { "id": "…", "type": "public-key", "...": "réponse de startRegistration()" } }
```

**Réponse 201** : la passkey créée. `400` si le challenge a expiré ou si la réponse ne se vérifie pas. Tracé `user.passkey_add`. Rate limit : 10/min.

### DELETE /api/auth/passkeys/:id 🔒

**Réponse 204**, `404` si la passkey n'est pas à l'utilisateur. Tracé `user.passkey_remove`.

### POST /api/auth/passkeys/login/options

Public. **Réponse 200** : `{ "challengeId": "32 hex", "options": { … } }`, options à passer à `startAuthentication()`. Rate limit : 10/min.

### POST /api/auth/passkeys/login/verify

Public. Rate limit : 10/min.

```json
{ "challengeId": "…", "response": { "id": "…", "type": "public-key", "...": "réponse de startAuthentication()" } }
```

**Réponse 200** : `{ "user": { "id", "email", "role" } }`, cookie de session posé, compteur de la passkey mis à jour. Tracé `user.login_passkey`. `401` identique pour un challenge expiré, une passkey inconnue, un compte désactivé ou une signature invalide.

## Jetons d'API

Jetons de longue durée pour Home Assistant ou un script, envoyés en `Authorization: Bearer nid_…`. Seul le SHA-256 du jeton est stocké : il n'est affiché qu'une fois, à la création. Un jeton connecte son propriétaire **jamais en admin**, et il est refusé (`403`) sur `/api/auth/*` (sécurité du compte, jetons eux-mêmes), `/api/admin/*`, `/api/privacy/*`, `/api/webhooks/*` et `/api/shares/*`. Un jeton `read` ne passe que `GET`/`HEAD`. Un jeton expiré, ou dont l'utilisateur est désactivé, reçoit `401`. Ces routes demandent le cookie de session.

```bash
curl -H "Authorization: Bearer nid_…" https://nid.example.com/api/dashboard/<accountId>/stats
```

### GET /api/auth/api-tokens 🔒

Les jetons de l'utilisateur, sans le jeton ni son hash : `[{ "id", "name", "scope", "expires_at", "last_used_at", "created_at" }]`. `last_used_at` est mis à jour au plus une fois par minute.

### POST /api/auth/api-tokens 🔒

```json
{ "name": "Home Assistant", "scope": "read", "expires_in_days": 365 }
```

`scope` : `read` (défaut) ou `write`. `expires_in_days` : 1–3650, ou `null` (défaut) pour aucune expiration. **Réponse 201** : la ligne du jeton plus `"token": "nid_…"`, seule fois où il est renvoyé. `409` au-delà de 20 jetons. Tracé `user.api_token_create`. Rate limit : 10/min.

### DELETE /api/auth/api-tokens/:id 🔒

**Réponse 204**, `404` si le jeton n'est pas à l'utilisateur. Tracé `user.api_token_revoke`.

## Partage d'un compte (lecture seule)

Le propriétaire d'un compte donne à d'autres utilisateurs Nid un accès **en lecture** à ses archives (table `account_shares`). Session uniquement (sous `/api/auth`). Un utilisateur avec qui le compte est partagé ne passe `requireAccountOwnership` qu'en `GET` sur : `/api/archive/:accountId/mails[/:mailId]`, `…/attachments/:attachmentId/download`, `…/threads[/:threadId]`, `…/contacts`, `…/tags`, `/api/labels/:accountId`, `/api/dashboard/:accountId/archive-stats`. Tout le reste (Gmail, corbeille, règles, écriture) répond `403`.

### GET /api/auth/accounts/:accountId/shares 🔒

Propriétaire seulement (`404` sinon) : `[{ "user_id", "email", "display_name", "created_at" }]`.

### POST /api/auth/accounts/:accountId/shares 🔒

`{ "email": "ami@example.com" }` (compte Nid actif, casse ignorée). **201** le partage ; `404` adresse inconnue (ou compte d'un autre), `400` soi-même, `409` déjà partagé. Tracé `account.share`. Rate limit : 10/min.

### DELETE /api/auth/accounts/:accountId/shares/:userId 🔒

Le propriétaire retire un accès, ou l'utilisateur concerné quitte le partage (`userId` = le sien). **204**, sinon `404`. Tracé `account.unshare`.

`GET /api/auth/me` renvoie aussi `sharedAccounts: [{ "id", "email", "provider", "shared_by" }]` (adresse du propriétaire).

---

## Comptes IMAP (archivage seul)

Un compte IMAP (tout fournisseur : OVH, Infomaniak, Fastmail, Outlook avec un mot de passe d'application…) est **archivé uniquement** : ses dossiers sont sauvegardés sur le NAS et consultables dans Archives ; Mails, Nettoyage et Règles restent réservés à Gmail (`409 Not a Gmail account` sur les routes Gmail). Session uniquement : un jeton d'API n'atteint jamais ces routes.

Le mot de passe est stocké scellé (AES-256-GCM, clé dérivée de `JWT_SECRET`) : **changer `JWT_SECRET` rend illisibles les mots de passe IMAP enregistrés**, à ressaisir avec `PUT`.

### POST /api/auth/imap 🔒

```json
{ "email": "ana@mail.fr", "host": "imap.mail.fr", "port": 993, "secure": true, "user": "ana@mail.fr", "password": "mot-de-passe-application" }
```

`port` vaut 993 par défaut, `secure` (TLS) `true`. La connexion est d'abord testée : **400** avec la raison donnée par le serveur s'il refuse, rien n'est enregistré. **201** `{ "id", "email" }`. `403` au-delà du quota de comptes, `409` si l'adresse est déjà connectée. Tracé `imap.connect`. Rate limit : 5/min.

### PUT /api/auth/imap/:accountId 🔒

Même corps sans `email` : nouveau serveur ou mot de passe, testé d'abord ; efface « Action requise » (`auth_error_at`) et une déconnexion. Tracé `imap.update`.

### Sauvegarde

La sauvegarde du compte (automatique, « Sauvegarder », assistant) est une synchronisation IMAP incrémentale : tous les dossiers sauf `\Noselect`, indésirables, corbeille et « Tous les messages » ; par dossier, seuls les UID au-delà du dernier archivé (`imap_folder_state`) ; un `UIDVALIDITY` changé relance le dossier ; les mails déjà archivés sont ignorés par `Message-ID` ; le dossier devient un libellé d'archive. Un login refusé par le serveur passe le compte en « Action requise » et envoie `account.reauth_required` une fois.
