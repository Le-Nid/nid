# Settings

The **Settings** page centralizes your account configuration, security, webhooks, and preferences.

---

## Profile

The profile section displays your information:

- **Email**: your sign-in email address
- **Display name**: editable (automatically retrieved from Google SSO)
- **Avatar**: retrieved from Google SSO when available
- **Role**: User or Administrator

---

## Connected Gmail Accounts

List of all your Gmail accounts linked to Nid:

- Email of each account
- Connection status (active / inactive)
- **Connect a Gmail account** button to add a new one
- **Disconnect** button to remove an account

> 📸 *Suggested screenshot: Gmail Accounts section with the account list and connect/disconnect buttons*

---

## Two-Factor Authentication (2FA)

::: info Local accounts only
2FA only applies to local accounts (email + password). Google SSO users are protected by Google's own 2FA.
:::

### Enable 2FA

1. Click **Set up 2FA**
2. A **QR code** is displayed
3. Scan it with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)
4. Enter the 6-digit code shown by the app
5. Click **Verify and Enable**

> 📸 *Suggested screenshot: 2FA setup QR code with the code verification field*

### Signing In with 2FA

When signing in, after entering your email and password, an additional field asks for the TOTP code from your authenticator app.

### Disable 2FA

Click **Disable 2FA** and confirm by entering a valid TOTP code.

---

## Notification Preferences

A table to choose, for each notification type, which channels are active (in-app and toast). See the [Notifications](notifications.md#préférences-de-notifications) page for details.

---

## Webhooks

Outbound webhook configuration. See the [Notifications — Webhooks](notifications.md#webhooks) page for details.

---

## Configuration Export / Import

Save and restore your configuration (rules and webhooks) in JSON format.

### Export

1. Click **Export**
2. A `nid-config.json` file is downloaded

The file contains your rules (associated by Gmail account email) and your webhooks. Sensitive data (tokens, secrets) is **not** included.

### Import

1. Click **Import**
2. Select a previously exported JSON file
3. Rules are matched to your Gmail accounts by email correspondence
4. Webhooks are imported directly

> 📸 *Suggested screenshot: Export/Import section with the Export and Import buttons*

::: warning Additive Import
Importing **adds** items without deleting existing ones. Importing the same file multiple times will create duplicates.
:::

---

## Activity Log (Audit Log)

The **Activity Log** section displays your recent actions in the application:

- Sign-ins and sign-outs
- Rule creation, modification, and deletion
- Bulk operations (deletion, archiving)
- Configuration exports and imports

> 📸 *Suggested screenshot: activity log with actions, dates, and details*

---

## Language

The language selector is located in the **navigation bar** (at the top), next to the notification bell.

Available languages:

- 🇫🇷 French (default)
- 🇬🇧 English

The choice is persisted in the browser and maintained across sessions.

---

## Theme

The **dark / light theme** toggle is located in the navigation bar, next to the language selector. The choice is persisted in the browser.
