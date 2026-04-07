# API — Authentication

All protected routes require an `Authorization: Bearer <token>` header.

---

## Local auth (JWT)

### POST /api/auth/register

Create a local account.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

**Response 201**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

**Errors**

| Code | Description |
|---|---|
| 409 | Email already registered |
| 400 | Validation failed (invalid email, password < 8 chars) |

---

### POST /api/auth/login

Log in.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

If 2FA is enabled, the server returns a `403` error with `TOTP_REQUIRED`. You must resend the request with the `totpCode` field:

```json
{ "email": "user@example.com", "password": "motdepasse123", "totpCode": "123456" }
```

**Response 200**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

**Errors**

| Code | Description |
|---|---|
| 401 | Invalid credentials or invalid TOTP code |
| 403 | Account disabled or `TOTP_REQUIRED` (2FA required) |

---

### GET /api/auth/me 🔒

Retrieve the user profile and associated Gmail accounts.

**Response 200**
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

The `totp_enabled` field is included in the `user` object to indicate whether 2FA is active.
```

---

## Google SSO

### GET /api/auth/google

Get the Google SSO login URL (sign up or sign in).

**Response 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

### GET /api/auth/google/callback

Google SSO callback. Redirects to `{FRONTEND_URL}/login?token=...&user=...` on success, or `{FRONTEND_URL}/login?google=error` on failure.
```

---

## OAuth2 Gmail

### GET /api/auth/gmail/connect 🔒

Generate the Google authorization URL.

**Response 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

The frontend redirects the user to this URL. Google then redirects to `/api/auth/gmail/callback`.

---

### GET /api/auth/gmail/callback

Google OAuth2 callback (do not call directly).

Google redirects to this endpoint after authorization. It:
1. Exchanges the code for tokens
2. Retrieves the Google account email
3. Stores the tokens in the database
4. Redirects to the frontend: `{FRONTEND_URL}/settings?gmail=connected&account=...`

---

### DELETE /api/auth/gmail/:accountId 🔒

Disconnect a Gmail account.

---

## 2FA / TOTP

### POST /api/auth/2fa/setup 🔒

Generate a TOTP secret and QR code for setting up 2FA.

**Response 200**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrDataUrl": "data:image/png;base64,..."
}
```

The QR code encodes the URI `otpauth://totp/Gmail%20Manager:user@email.com?secret=...&issuer=Gmail%20Manager`.

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
| 400 | 2FA already enabled, setup not completed, or invalid code |

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

**Response 204** — No content

!!! note
    Existing archives for this account **are not deleted** upon disconnection.
