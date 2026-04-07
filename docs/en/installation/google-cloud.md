# Google Cloud Setup

Step-by-step guide to configure the OAuth2 credentials required by Nid.

---

## 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click on the project selector at the top → **New Project**
3. Name it (e.g., `nid`) and click **Create**

---

## 2. Enable the Gmail API

1. In the side menu: **APIs & Services** → **Library**
2. Search for **Gmail API**
3. Click **Enable**

---

## 3. Configure the OAuth Consent Screen

1. **APIs & Services** → **OAuth consent screen**
2. Choose the type:
    - **Internal**: if you have a Google Workspace account (no warning screen)
    - **External**: for personal Gmail accounts (requires test users)
3. Fill in:
    - Application name: `Nid`
    - Support email: your email
    - Authorized domain: your domain (or leave empty for localhost)
4. Add the **scopes**:
    - `https://www.googleapis.com/auth/gmail.modify`
    - `https://www.googleapis.com/auth/gmail.labels`
    - `https://www.googleapis.com/auth/userinfo.email`
    - `https://www.googleapis.com/auth/userinfo.profile`
5. If **External**: add your email as a **test user**

::: warning Application in Test Mode
As long as the application is in "Test" mode, Google will display a warning screen during sign-in. This is normal for personal use. Click **Advanced settings** → **Go to nid (unsafe)** to continue.
:::

---

## 4. Create OAuth2 Credentials

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `Nid`
4. Add **two** authorized redirect URIs:

```
http://localhost:3000/api/auth/gmail/callback
http://localhost:3000/api/auth/google/callback
```

| URI | Purpose |
|---|---|
| `/api/auth/gmail/callback` | Connecting a Gmail account to the application (Gmail OAuth2) |
| `/api/auth/google/callback` | Sign up / sign in via Google SSO |

::: tip Custom Domain
If you expose the application on a domain (e.g., `https://gmail.mynas.com`), replace `http://localhost:3000` with your public URL in the callback URIs **and** in the `FRONTEND_URL` variable in `.env`.
:::

5. Click **Create**
6. Note the **Client ID** and **Client Secret** → add them to your `.env`

---

## 5. Add to `.env`

```bash
GOOGLE_CLIENT_ID=123456789-xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

Callback URIs are automatically derived from `FRONTEND_URL` in Docker production. In development, set them explicitly:

```bash
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/gmail/callback
GOOGLE_SSO_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

---

## Troubleshooting

### `redirect_uri_mismatch` Error

The callback URI configured in Google Cloud doesn't exactly match the one used by the application. Check:

- The protocol (`http` vs `https`)
- The port (`3000` in prod, `4000` in dev)
- The exact path (no trailing `/`)

### `invalid_client` Error

The Client ID or Client Secret is incorrect. Check your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` variables.

### Google Warning Screen Appears

This is normal if the application is in "Test" mode. For personal self-hosted use, you can ignore this warning. To remove it, publish your Google Cloud application (requires Google OAuth verification).

### Refresh Token Not Received

Google only returns the `refresh_token` on the **first** consent. If you reconnect an already authorized Gmail account:

1. Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. Revoke access for Nid
3. Reconnect the account — the refresh token will be issued again
