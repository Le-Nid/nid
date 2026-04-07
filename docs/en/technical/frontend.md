# Frontend Architecture

## Stack

| Library | Role |
|---|---|
| `react 19` | UI, Server Components ready but not used (classic SPA) |
| `react-router v7` | Client-side routing |
| `antd v6` | UI components (Table, Form, Chart, Layout, etc.) |
| `@ant-design/charts` | Dashboard charts (based on G2) |
| `lucide-react` | Consistent SVG icons (replaces emojis and Ant Design icons) |
| `zustand` | Global state management (lightweight stores) |
| `axios` | HTTP client with JWT interceptors |
| `dayjs` | Date manipulation (required by Ant Design) |
| `react-i18next` | Internationalization (`useTranslation` hooks) |
| `i18next` | i18n engine, automatic language detection |
| `i18next-browser-languagedetector` | Browser language detection |
| `vite` | Bundler, HMR in dev |

---

## Zustand Store Structure

### `auth.store.ts`

Manages:
- JWT token (persisted in `localStorage`)
- Local user profile (email, role, display_name, avatar_url, quotas)
- List of connected Gmail accounts
- Active Gmail account (sidebar selector)
- Login via Google SSO (`loginWithToken`)

```typescript
const { token, user, gmailAccounts, activeAccountId } = useAuthStore()
// user.role: 'user' | 'admin'
// user.display_name, user.avatar_url: depuis Google SSO
// user.max_gmail_accounts, user.storage_quota_bytes: quotas
```

---

## Routing

```
/login              → LoginPage (unprotected, handles TOTP 2FA)
/                   → Redirect → /dashboard
/dashboard          → DashboardPage 🔒
/mails              → MailManagerPage 🔒
/archive            → ArchivePage 🔒
/rules              → RulesPage 🔒 (includes Templates drawer)
/jobs               → JobsPage 🔒
/settings           → SettingsPage 🔒 (profile, Gmail, 2FA, audit log)
/admin              → AdminPage 🔒🛡️ (admin only)
/unsubscribe        → UnsubscribePage 🔒
/attachments        → AttachmentsPage 🔒
/duplicates         → DuplicatesPage 🔒
/insights           → InsightsPage 🔒
/privacy            → PrivacyPage 🔒 (tracking pixels, PII, encryption)
```

### Keyboard Shortcuts

The **MailManager** page integrates the `useKeyboardShortcuts` hook which captures `j/k` (navigation), `Enter/o` (open), `e` (archive), `#` (trash), `r/u` (read/unread), `/` (search), `Escape` (deselect). Shortcuts are disabled in input fields.

### Bulk Actions

The **MailManager** page provides an **"Archive all"** button that launches a differential archiving of all emails matching the current query, without manual selection. The operation is asynchronous (BullMQ job) with SSE tracking.

Metadata loading (subject, sender, size) uses the **batch** endpoint (`POST /messages/batch`) to fetch up to 100 messages in a single call, avoiding 429 errors.

The `ProtectedRoute` component checks for the JWT token presence. If absent, redirects to `/login`.

The `AdminRoute` component verifies that `user.role === 'admin'`. If non-admin, redirects to `/dashboard`.

---

## HTTP Client (axios)

`src/api/client.ts` configures an axios client with:

- `baseURL` from `VITE_API_URL`
- Automatic JWT injection in the `Authorization: Bearer` header
- Automatic redirect to `/login` on 401 response

All pages make their calls through this client, never via `fetch` directly.

---

## Vite Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `` (empty) | Backend API URL. In dev, the Vite proxy redirects `/api` to `localhost:4000` |

In production (multi-stage Dockerfile), the Vite build is served by Nginx which proxies `/api` to the backend.

---

## Icons (Lucide React)

All application icons use [Lucide React](https://lucide.dev/), an open source SVG icon library. Emojis and Ant Design icons have been replaced for a uniform professional look.

### Usage

```tsx
import { Mail, Archive, Trash2, Settings } from 'lucide-react'

<Mail size={16} />
<Archive className="icon-muted" />
```

### Conventions

- **Size**: `16` in menus and buttons, `20-24` in titles and cards
- **Dark mode**: icons inherit `currentColor` and automatically adapt to the theme
- **i18n**: translation keys reference Lucide icons (no emojis) for identical rendering across all platforms

---

## Internationalization (i18n)

The application is fully translated into **French** (default language) and **English**, using `react-i18next`.

### Configuration

The `src/i18n/index.ts` file initializes i18next with:

- **`LanguageDetector`** — detects the browser language on first load
- **`fallbackLng: 'fr'`** — French by default if the language is not supported
- **`localStorage` persistence** — key `i18nextLng`, the user's choice is remembered

### Translation Files

```
src/i18n/
├── index.ts              ← Configuration i18next
└── locales/
    ├── fr.json           ← ~370+ clés, namespace plat
    └── en.json           ← Traductions anglaises (même structure)
```

Keys are organized by functional domain in a flat namespace:

```json
{
  "dashboard.title": "Tableau de bord",
  "mails.search": "Rechercher...",
  "rules.create": "Créer une règle",
  "jobs.bulkOperation": "Opération groupée",
  "settings.profile": "Profil",
  "admin.users": "Utilisateurs"
}
```

### Language Selector

A `<Select>` language selector is integrated in the navigation bar (`AppLayout.tsx`), between the notification bell and the dark theme toggle. It displays the flags 🇫🇷 / 🇬🇧 and calls `i18n.changeLanguage()` on change.

### Ant Design and dayjs Integration

- **Ant Design**: the `ConfigProvider` locale is dynamically synchronized (`frFR` / `enUS`) in `main.tsx` based on the active language.
- **dayjs**: the locale is changed dynamically in components that display relative dates (Rules, Jobs, NotificationBell).
- **`<html lang>`**: the document's `lang` attribute is updated via a `useEffect` in `main.tsx`.

### Usage in Components

All pages and components use the `useTranslation()` hook:

```tsx
import { useTranslation } from 'react-i18next';

function MaPage() {
  const { t } = useTranslation();
  return <h1>{t('dashboard.title')}</h1>;
}
```

### Translated Pages and Components

All application pages and components are translated:

- **Pages**: Login, Dashboard, MailManager, Jobs, Archive, Rules, Settings, Admin, Unsubscribe, Attachments, Insights, Duplicates, Privacy
- **Components**: AppLayout, BulkActionBar, NotificationBell, MailViewer, GmailSearchInput, RuleFormModal, JobProgressModal

## PWA (Progressive Web App)

Nid is an installable PWA: the application can be added to the home screen on mobile and desktop, and works partially offline thanks to the service worker.

### Configuration

- **Manifest**: `public/manifest.json` — defines the name, icons, colors, and `standalone` mode.
- **Service Worker**: `public/sw.js` — registered on load in `main.tsx`.
- **Icons**: 192×192 and 512×512 in standard + maskable in `public/`.
- **Meta tags**: `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon` in `index.html`.

### Service Worker Cache Strategy

| Request Type | Strategy | Detail |
|---|---|---|
| API (`/api/*`) | Network-only | No cache for dynamic data |
| SSE | Ignored | Real-time streams are not intercepted |
| Static assets (JS, CSS, images) | Cache-first | Automatically cached after first load |
| Navigation (HTML) | Network-first | Falls back to cache if offline (app shell) |

### Installation from the Browser

On Chrome/Edge (desktop and mobile), an "Install" button appears in the URL bar. On Safari iOS, use "Add to Home Screen" from the share menu.

## Responsive Navigation (Mobile)

The application adopts a **responsive** approach (no separate native app) via the Ant Design breakpoint system (`Grid.useBreakpoint`).

### Behavior by Screen Size

| Screen | Navigation | Content |
|---|---|---|
| **Desktop** (≥ 768px) | Collapsible fixed sidebar (220px / 64px) | 24px padding |
| **Mobile** (< 768px) | Slide-in drawer from the left (280px) | 12px padding |

### Mobile Adaptations

- **Hamburger menu**: ☰ button in the header to open the navigation drawer.
- **Auto-close**: the drawer closes after each navigation.
- **Compact user menu**: name and admin badge hidden on mobile, only the avatar remains visible.
- **Touch-friendly**: menu items 44px minimum (WCAG 2.5.8 accessibility).
- **Safe areas**: notch support via `env(safe-area-inset-*)` for standalone PWA mode.
- **Scrollable tables**: native horizontal scroll on Ant Design tables.
- **Full-screen modals**: modals take up nearly the full width on mobile.
