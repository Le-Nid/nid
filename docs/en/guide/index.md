# User Guide

Nid manages and archives your Gmail mailboxes from your own server (NAS, home server). This guide follows the app's layout: one page per screen.

---

## Screens

| Screen | Address | What it is for |
|---|---|---|
| [**Overview**](overview.md) | `/overview` | Account status, top senders, suggestions, running jobs |
| [**Mail**](mails.md) | `/mails` | Search, select and act on your mails in bulk, with undo |
| [**Cleanup**](cleanup.md) | `/cleanup` | Senders & newsletters, large mails & attachments |
| [**Rules & labels**](rules.md) | `/rules` | Automatic rules, Gmail labels, templates |
| [**Archives**](archives.md) | `/archives` | Local copy on the NAS: search, reader, sharing, trash, retention |
| [**Activity**](activity.md) | `/activity` | Every task started, live |
| [**Settings**](settings.md) | `/settings/…` | Account, Security, Gmail accounts, Notifications & webhooks, Data |
| [**Attachments**](attachments.md) | `/attachments` | Full attachment list (from the ⌘K palette) |
| [**Notifications**](notifications.md) | bell + Settings | In-app notifications, toasts, webhooks |
| [**Administration**](admin.md) | `/admin` | Users, instance settings, audit (admins) |

New to Nid? Start with [**First Steps**](first-steps.md).

---

## Finding your way around

### On desktop

- **Sidebar** on the left: logo, **Collapse sidebar** button (`Ctrl+B` / `⌘B`), **Gmail Account** selector, **Search…** button, then the entries Overview, Mail, Cleanup, Rules & labels, Archives, Activity, Settings. Administrators also get an **Administration** group with **Admin**.
- **Counters** next to the entries: number of mails in the account (Mail), number of active rules (Rules & labels), "N running" (Activity).
- **Header**: the [notifications](notifications.md) bell and the user menu (avatar): **Language**, **Dark mode**, **Log out**.

### On mobile

The header keeps the bell and the avatar; the avatar menu also holds the **Gmail Account** choice. A bar at the bottom of the screen leads to **Home** (Overview), **Mail**, **Cleanup**, **Archives** and **More**.

The **More** page holds the rest:

- **Tools**: Rules & labels, Activity (with the number of running tasks);
- **Settings**: the five sections, each with a summary ("2FA on", "1 action required", "Import, export"…);
- **Administration** (admins only): "Instance admin";
- at the bottom: "Signed in as …" and **Sign out of Nid**.

### Command palette

`⌘K` (Mac) or `Ctrl+K` opens the "Go to…" palette: every navigation page, the **New rule** action, and under **Other pages** the [Attachments](attachments.md) page.

### Old addresses

Old pages redirect to their new place: `/dashboard`, `/analytics`, `/insights` → Overview; `/unified` → Mail, "All accounts"; `/saved-searches` → Mail; `/unsubscribe` → Cleanup; `/expiration` → Rules & labels, Labels tab; `/archive` → Archives; `/sharing` → Archives, Shares tab; `/jobs` → Activity; `/privacy` → Settings › Account; `/ops` → Settings › Data.
