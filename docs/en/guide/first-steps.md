# First steps

This guide walks you through your first minutes with Nid.

---

## Create your account

Open the application in your browser (default: [http://localhost:3000](http://localhost:3000)).

Two account creation options are available:

### Local account

1. Click **Create an account**
2. Enter your email and a password (minimum 8 characters)
3. Click **Sign up**

### Sign in with Google (SSO)

1. Click **Sign in with Google**
2. Choose your Google account
3. Grant access

Your Google name and avatar are retrieved automatically.

> 📸 *Suggested screenshot: login page with both options (form + Google SSO button)*

::: tip Account merging
If you first create a local account and then sign in with Google using the same email, both accounts are automatically merged.
:::

---

## Become an administrator

The first user must be promoted to administrator. Three options:

### Option A — Automatically (recommended)

Before creating your account, add the following to the `.env` file:

```bash
ADMIN_EMAIL=your@email.com
```

The user who signs up with this email automatically gets the admin role.

### Option B — In the database

If your account already exists:

```bash
docker compose exec postgres psql -U gmailmanager -d gmailmanager \
  -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

Log out and log back in for the new role to take effect.

### Option C — Via the interface

An existing administrator can promote other users from **Administration** → **Users** → **Change role**.

::: info Difference between roles
- **User**: full access to their own data (emails, archives, rules, etc.)
- **Administrator**: access to all users' data + quota and role management
:::

---

## Connect a Gmail account

Once logged in, you need to link your Gmail mailbox so the application can access it.

1. Go to **Settings** (⚙️ icon in the sidebar)
2. In the **Gmail accounts** section, click **Connect a Gmail account**
3. Google will ask you to authorize three types of access:
    - Reading and modifying your emails
    - Managing your labels
    - Reading your email address
4. Click **Allow**
5. You are redirected to Settings with a confirmation

> 📸 *Suggested screenshot: Settings page with the "Connect a Gmail account" button and the list of connected accounts*

::: warning Google warning screen
If your Google Cloud project is in "Test" mode, a warning screen will appear. Click **Advanced settings** → **Go to nid (unsafe)**. This is normal for personal self-hosted use.
:::

### Adding more Gmail accounts

Repeat the process to connect additional accounts. You can manage up to 5 accounts by default (configurable by the administrator).

Each account appears in the **account selector** at the top of the sidebar. Select an account to display its data across all sections of the application.

> 📸 *Suggested screenshot: Gmail account selector in the sidebar with multiple accounts listed*

---

## Explore the Dashboard

After connecting your Gmail, the **Dashboard** automatically loads your mailbox statistics:

- **Top senders**: who sends you the most emails and takes up the most space
- **Largest emails**: quickly identify emails to delete first
- **Timeline**: email volume evolution by month
- **Label distribution**: distribution of your Gmail labels

> 📸 *Suggested screenshot: full Dashboard page with the 4 charts*

The initial loading may take a few seconds depending on the size of your mailbox.

---

## Your first cleanup operation

Try a first bulk deletion operation:

1. Open **My emails** in the sidebar
2. Use the search bar to filter (e.g.: `from:newsletter@example.com`)
3. Check the box at the top of the table to select all results
4. Click **Delete (trash)** in the action bar
5. A **job** is created — a modal window shows real-time progress

> 📸 *Suggested screenshot: My emails page with selected emails and the bulk action bar visible*

> 📸 *Suggested screenshot: job progress modal with progress bar*

::: tip Trash vs permanent deletion
Deletion sends emails to the **Gmail trash** (recoverable for 30 days). Permanent deletion is irreversible — use it with caution.
:::

---

## Your first archive

To back up emails to your NAS:

1. In **My emails**, filter the emails to archive
2. Select them or click **Archive all** to archive all results
3. An archiving job is created
4. The EML files are saved to the archives folder

Then check the **Archives** section to find your archived emails with full-text search.

> 📸 *Suggested screenshot: Archives section with the search bar and the list of archived emails*

---

## What's next?

Now that you are up and running, explore the other features:

- [**Automatic rules**](rules.md) — automate recurring cleanup
- [**Newsletters**](newsletters.md) — identify and clean up newsletters in bulk
- [**Analytics**](analytics.md) — understand your email habits
- [**Settings**](settings.md) — enable 2FA, configure webhooks, change the language
