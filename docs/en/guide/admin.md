# Administration

The **Admin** page (`/admin`) is reserved for users with the **admin** role: the entry only shows for them (**Administration** group in the sidebar, or **More › Administration** on mobile), and the address sends other users back to the Overview.

Three tabs: **Users**, **System**, **Audit**.

---

## Users

Search by **Email or name**, then the paginated list:

| Column | Content |
|---|---|
| **User** | email and name |
| **Role** | Admin or User |
| **Status** | Active or Disabled |
| **Gmail accounts** | "N / max accounts" |
| **Storage** | archives used / quota |
| **Last login** | date, or "Never logged in" |

**Edit** opens "Edit user":

- **Role**: User or Admin;
- **Active account**: a disabled account can no longer sign in ("This account has been disabled");
- **Maximum Gmail accounts**;
- **Storage quota (GB)**.

Below the form:

- **Reset password**: sets a new password (at least 8 characters) to pass on to the user; their open sessions are signed out (for your own password, use Settings › Security);
- **Delete user**: after a confirmation, permanently deletes the account, its Gmail accounts and its archives. Not offered on your own account (use [Settings › Data](settings.md#delete-my-account)); the last active admin cannot be deleted.

---

## System

"Settings of this Nid instance, for every user."

### Archive trash

- **Maximum time in the trash**: 7, 30 or 90 days.
- Current volume ("N emails · size") and next purge date (or "automatic purge disabled").
- **Empty the trash now…**: after confirmation ("Permanently empty the trash?"), deletes the trash mails from the NAS **for every user**. Cannot be undone.

### Archive integrity

Checks that the NAS files match the index: "Archives are intact", or the number of missing, corrupted and orphaned files. Shows the last check and the number of mails checked. "Automatic check every day at 3 am."; **Run a check** starts one now.

When a problem is found, the **Integrity alert** event is notified (see [Notifications](notifications.md)).

### Gmail API quota

Usage of the instance's Google project, all accounts: **Units today**, **Peak per user** (units per second / limit), **429 responses over 24 h**.

### Jobs of all users

The 20 most recent jobs of the instance: **Job**, **User**, **Status**, **Created**.

---

## Audit

The instance log, filterable by **User** (email) and by **Action** (or **All actions**). Columns: **Date**, **User**, **Action**, **Target**.
