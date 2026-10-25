# API — Authentication

Authentication relies on a JWT set in the httpOnly `token` cookie (24 h lifetime, `SameSite=strict`). An `Authorization: Bearer <token>` header is also accepted. Routes marked 🔒 require that JWT; a revoked JWT (logout) or a disabled user returns `401`.

---

## Public configuration

### GET /api/auth/config

Tells the frontend which sign-in methods are available. Public.

**Response 200**
```json
{ "allowRegistration": true, "googleSsoEnabled": true, "passwordResetEnabled": false, "socialProviders": ["google", "microsoft"] }
```

`passwordResetEnabled`: SMTP is configured (`SMTP_URL`), "Forgot your password" is available.

---

## Local auth (JWT)

### POST /api/auth/register

Create a local account. Rate limit: 3 requests / minute. The address equal to `ADMIN_EMAIL` gets the `admin` role.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

`password`: 8 to 128 characters.

**Response 201** — the JWT is set in the cookie.
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

**Errors**

| Code | Description |
|---|---|
| 400 | Validation failed (invalid email, password < 8 chars) |
| 403 | Registration disabled (`ALLOW_REGISTRATION=false`) |
| 409 | Email already registered |

---

### POST /api/auth/login

Sign in. Rate limit: 5 requests / minute.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

If 2FA is enabled, the server returns `403` with `{ "error": "TOTP_REQUIRED" }`. Resend the request with the `totpCode` field (6 digits):

```json
{ "email": "user@example.com", "password": "motdepasse123", "totpCode": "123456" }
```

**Response 200** — the JWT is set in the cookie.
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

**Errors**

| Code | Description |
|---|---|
| 401 | Invalid credentials, disabled account or invalid TOTP code (single message, no enumeration) |
| 403 | `TOTP_REQUIRED` (2FA required) |

---

### POST /api/auth/logout 🔒

Revokes the current JWT (Redis blacklist until it expires) and clears the cookie.

**Response 204** — No content

---

### POST /api/auth/refresh 🔒

Issues a fresh JWT (cookie) without signing in again.

**Response 200**
```json
{ "user": { "id": "uuid", "email": "user@example.com", "role": "user" } }
```

---

### POST /api/auth/password/forgot

E-mails a `FRONTEND_URL/reset-password?token=…` link, valid for 1 hour. Public, rate limit 3/min per IP and at most one e-mail per account per minute.

```json
{ "email": "user@example.com" }
```

**Response 204** in every case (unknown address, SSO-only or disabled account: no e-mail), and sending is not awaited: neither the answer nor its timing tells whether an account exists. `404` if `SMTP_URL` is not set. The token is stored in Redis under its SHA-256.

---

### POST /api/auth/password/reset

Sets the new password with the e-mailed token (single use). Revokes every session and opens none: the user signs in again, 2FA included. Logged as `user.password_reset`. Rate limit: 5/min.

```json
{ "token": "64 hex characters", "newPassword": "new-at-least-8-chars" }
```

**Response 204**. `400` if the link is unknown, already used, expired, or issued before the last password change.

---

### PATCH /api/auth/password 🔒

Change the password of a local account. Revokes every other session (`users.password_changed_at`); the current session gets a new cookie. Rate limit: 5/min.

```json
{ "currentPassword": "old", "newPassword": "new-at-least-8-chars" }
```

**Response 204**. `400` if the account has no password (SSO only), `400` too if the current password is wrong (not `401`, which the frontend turns into a redirect to `/login`).

---

### GET /api/auth/me/export 🔒

GDPR export: everything Nid stores about the user, as JSON (`Content-Disposition: attachment`). Profile, social and Gmail accounts, preferences, notifications, audit log, webhooks, saved searches, retention, shares, jobs, rules, labels, expirations, analyses, archived mail and attachment metadata. Left out: secrets (password and TOTP hashes, OAuth tokens, webhook credentials, share tokens) and mail content, exported per account as mbox/ZIP. Rate limit: 3/min.

---

### DELETE /api/auth/me 🔒

Permanently deletes the account: the user, their Gmail accounts, their archives (DB rows and files under `ARCHIVE_PATH/<accountId>/`), their rules and the rest (cascade). Nothing is deleted in Gmail. Rate limit: 3/min.

```json
{ "password": "..." }
```

A local account confirms with `password`, an SSO-only account with `email` (its address). **Response 204** (cookie cleared). `401` if the confirmation is wrong, `409` for the last active admin.

---

### GET /api/auth/me 🔒

Get the user profile and linked Gmail accounts.

**Response 200**
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
      "id": "uuid", "email": "account@gmail.com", "is_active": true, "created_at": "...",
      "backup_enabled": false, "backup_interval": "24h",
      "needs_reauth": false, "last_sync_at": "..."
    }
  ],
  "storageUsedBytes": 1073741824
}
```

- `needs_reauth`: Google refused the refresh token, the account must be reconnected ("Action required").
- `last_sync_at`: last label sync (`null` if never).
- `has_password`: local account with a password (`false`: SSO only).

---

## Google SSO

### GET /api/auth/google

Get the Google SSO sign-in URL (registration or login). Public.

**Response 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### GET /api/auth/google/callback

Google SSO callback (do not call directly). On success, sets the JWT cookie (unless 2FA is on, see below) and redirects to `{FRONTEND_URL}/login?sso_code=<code>`; otherwise to `{FRONTEND_URL}/login?google=error` (or `google=disabled` if the account is disabled).

### POST /api/auth/google/exchange

Exchanges the `sso_code` (valid 60 s, single use) for the user info. The JWT is already in the cookie. Also used when returning from social providers. Limited to 10 requests/minute.

When 2FA is on for the account, the callback does **not** set the cookie: the `sso_code` stays valid for 5 minutes and the exchange requires `totpCode`. The JWT cookie is set only once the code is verified. After 5 invalid codes the `sso_code` is revoked and the SSO sign-in must be restarted.

**Body**
```json
{ "code": "<sso_code>", "totpCode": "123456" }
```

`totpCode`: optional, required only when 2FA is on.

**Response 200**
```json
{ "id": "uuid", "email": "user@example.com", "role": "user" }
```

**Errors**: `401` invalid or expired code, or invalid TOTP code; `403` `TOTP_REQUIRED` (2FA on, `totpCode` missing).

---

## Social login

### GET /api/auth/social/:provider/url

Get the authorization URL of a configured social provider (see `socialProviders` in `/api/auth/config`). Public. `provider`: `google`, `microsoft`, `discord`, `facebook`, `linkedin` or `keycloak`.

**Response 200**
```json
{ "url": "https://..." }
```

**Errors**: `400` provider not configured.

### GET /api/auth/social/:provider/callback

Provider callback (do not call directly). Same behavior as the Google callback: redirects to `{FRONTEND_URL}/login?sso_code=<code>`, or `{FRONTEND_URL}/login?social=error` / `social=disabled`.

---

## Gmail OAuth2

### GET /api/auth/gmail/connect 🔒

Generate the Google authorization URL (signed JWT state, valid 5 min).

**Response 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**Errors**: `403` maximum number of Gmail accounts reached (`max_gmail_accounts`).

The frontend redirects the user to this URL. Google then redirects to `/api/auth/gmail/callback`.

---

### GET /api/auth/gmail/callback

Google OAuth2 callback (do not call directly).

Google redirects to this endpoint after authorization. It:
1. Verifies the signed state
2. Exchanges the code for tokens and stores the account (reconnecting an existing address reactivates its account)
3. Starts a first label sync in the background
4. Redirects to `{FRONTEND_URL}/settings/gmail?gmail=connected&account=...` (or `?gmail=error`)

---

### DELETE /api/auth/gmail/:accountId 🔒

Soft disconnect of a Gmail account: tokens are cleared and the account becomes inactive (no more sync or backup), but it stays in the database.

**Response 204** — No content

::: tip
This account's archives are **not deleted**; reconnecting the same address reactivates the account.
:::

---

### PATCH /api/auth/gmail/:accountId/toggle 🔒

Enables / disables a Gmail account.

**Response 200**
```json
{ "id": "uuid", "is_active": false }
```

**Errors**: `404` account not found; `409` account disconnected (no token left): it must be reconnected.

---

### PATCH /api/auth/gmail/:accountId 🔒

Gmail account settings (automatic NAS backup).

**Body** (at least one field)
```json
{ "backup_enabled": true, "backup_interval": "6h" }
```

`backup_interval`: `1h`, `6h` or `24h`.

**Response 200**
```json
{ "id": "uuid", "backup_enabled": true, "backup_interval": "6h" }
```

**Errors**: `400` invalid or empty body; `404` account not found.

---

## 2FA / TOTP

### POST /api/auth/2fa/setup 🔒

Generate a TOTP secret and a QR code to set up 2FA.

**Response 200**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrDataUrl": "data:image/png;base64,..."
}
```

The QR code encodes the URI `otpauth://totp/Nid:user@email.com?secret=...&issuer=Nid`. If 2FA is already enabled, the response is `200` with `{ "error": "2FA is already enabled" }`.

### POST /api/auth/2fa/enable 🔒

Verify a TOTP code and enable 2FA.

**Body**
```json
{ "token": "123456" }
```

**Response 200**
```json
{ "success": true }
```

**Errors**

| Code | Description |
|---|---|
| 400 | 2FA already enabled, setup not done, or invalid code |

### POST /api/auth/2fa/disable 🔒

Disable 2FA (requires a valid TOTP code).

**Body**
```json
{ "token": "123456" }
```

**Response 200**
```json
{ "success": true }
```

**Errors**

| Code | Description |
|---|---|
| 400 | 2FA not enabled or invalid code |

::: warning Google SSO and 2FA
2FA only applies to accounts with a local password. Users signed in via Google SSO are protected by Google's own 2FA.
:::
