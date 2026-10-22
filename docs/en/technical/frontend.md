# Frontend Architecture

The UI specification (navigation, pages, components) is `design/ui-redesign.md`.

## Stack

| Library | Role |
|---|---|
| `react 19` + `react-dom` | UI (SPA, pages loaded with `lazy()`) |
| `react-router 7` | Client-side routing |
| `vite 8` + `@vitejs/plugin-react` | Bundler, dev HMR, `/api` → `localhost:4000` proxy |
| `tailwindcss 4` (`@tailwindcss/vite`) | Utility styles, light/dark theme through CSS variables |
| `radix-ui` + shadcn/ui | Accessible primitives; shadcn components vendored in `src/components/ui/` |
| `@tanstack/react-table 9` | Tables (sorting, selection, column visibility) through `DataList` |
| `@tanstack/react-query 5` | Server data (cache, invalidation) |
| `zustand 5` | Client state (session, theme) |
| `axios` | HTTP client (httpOnly cookie, 401 interceptor) |
| `sonner` | Toasts (including the undo toast) |
| `cmdk` | ⌘K command palette |
| `lucide-react`, `@icons-pack/react-simple-icons` | Icons |
| `dayjs` | Relative dates |
| `i18next`, `react-i18next`, `i18next-browser-languagedetector` | fr/en internationalization |
| `vite-plugin-pwa` | Manifest + service worker |
| `@fontsource-variable/geist`, `geist-mono` | Fonts |

---

## `src/` Layout

```
src/
├── App.tsx                ← Routes, ProtectedRoute, AdminRoute, redirects
├── main.tsx               ← QueryClient, BrowserRouter, ErrorBoundary, registerSW
├── api/
│   ├── client.ts          ← axios instance (withCredentials, 401 interceptor)
│   └── index.ts           ← Endpoints grouped by module (jobsApi, rulesApi…)
├── components/
│   ├── app/               ← App components (AppShell, DataList, MailViewer…)
│   ├── ui/                ← Vendored shadcn/ui (button, dialog, sheet, sidebar, table…)
│   └── ErrorBoundary.tsx
├── hooks/
│   ├── queries.ts         ← React Query hooks + query key factories
│   ├── useJobSSE.ts       ← One job's progress (SSE)
│   ├── useLiveCounters.ts ← Live counters (SSE)
│   ├── useGlobalJobNotifier.tsx, useMailActions.ts, useKeyboardShortcuts.ts
│   ├── useAccount.ts, use-mobile.ts
├── pages/                 ← One page per route + tab subfolders
│   ├── admin/ archives/ cleanup/ overview/ rules/ settings/
├── store/                 ← auth.store.ts, theme.store.ts
├── i18n/                  ← index.ts + locales/fr.json, en.json
├── lib/utils.ts           ← cn() (clsx + tailwind-merge)
├── styles/, types/, utils/  ← format, gmail, download, logger…
└── __tests__/             ← Vitest tests + setup.ts
```

---

## Zustand Stores

Server data goes through React Query; Zustand only holds client state.

### `auth.store.ts`

- `user` (email, role, display_name, avatar_url, quotas, `totp_enabled`), `isAuthenticated`, `initialLoading`
- `gmailAccounts` (with `backup_enabled`, `backup_interval`, `needs_reauth`) and `activeAccountId` (persisted in `localStorage`)
- Actions: `login`, `register`, `loginWithSsoCode`, `logout`, `fetchMe`, `setActiveAccount`

No token is stored client-side: the session is an httpOnly cookie. `App.tsx` calls `fetchMe()` on mount to restore the session.

### `theme.store.ts`

`light` / `dark` mode; the `system` preference (nothing in `localStorage`) follows `prefers-color-scheme`. Imported in `main.tsx` so the `.dark` class is applied before the first render.

---

## Routing

```
/login              → Login (public, TOTP 2FA)
/shared/:token      → SharedMail (public share link)
/                   → AppShell 🔒, then:
  /overview         → Overview                (RequireGmailAccess)
  /mails            → Mails                   (RequireGmailAccess)
  /cleanup          → Cleanup                 (RequireGmailAccess)
  /rules            → Rules                   (RequireGmailAccess)
  /archives         → Archives
  /attachments      → Attachments
  /activity         → Activity (jobs)
  /settings/:section→ Settings (account, gmail, security, notifications, data)
  /more             → More (mobile menu)
  /admin            → Administration 🛡️ (AdminRoute)
```

- `ProtectedRoute` waits for `initialLoading`, then redirects to `/login` when not authenticated.
- `AdminRoute` redirects to `/overview` when `user.role !== 'admin'`.
- `RequireGmailAccess`: on a disconnected Gmail account, pages that call Gmail offer reconnection instead of failing.

### Legacy URL Redirects

| Legacy URL | Target |
|---|---|
| `/`, `/dashboard`, `/analytics`, `/insights` | `/overview` |
| `/archive` | `/archives` |
| `/jobs` | `/activity` |
| `/settings` | `/settings/account` |
| `/ops` | `/settings/data` |
| `/unsubscribe` | `/cleanup?tab=senders` |
| `/expiration` | `/rules?tab=labels` |
| `/sharing` | `/archives?tab=shares` |
| `/privacy` | `/settings/account` |
| `/unified` | `/mails?account=all` |
| `/saved-searches` | `/mails` |

Redirects keep the query string (e.g. `/settings?gmail=connected` after the OAuth callback).

---

## AppShell and Navigation

`components/app/AppShell.tsx` is the layout of every authenticated page:

- **≥ 768 px**: `AppSidebar` (shadcn `Sidebar`, 15rem) with the entries of `components/app/nav.ts` and their live badges.
- **< 768 px** (`useIsMobile`): `BottomNav` (Overview, Mails, Cleanup, Archives, More); `/more` gathers the rest.
- Header: `NotificationBell` + user menu (accounts, theme, language, logout).
- `CommandPalette` (⌘K, `cmdk`), sonner `Toaster`, `useGlobalJobNotifier()` (toast when a job ends, per user preferences).
- `useLiveCounters()` opens **one** SSE connection per tab; pages read the counters through `useOutletContext()`.

`nav.ts` defines the entries (`NAV`), the path prefixes that highlight them (legacy pages included), the badges (`navBadge`: mail total, active rules, active jobs) and `visibleNav(role)` (Administration for admins only).

---

## Lists: `DataList`

`components/app/DataList.tsx` renders a TanStack Table instance as a `<table>` (≥ md) or as cards (mobile). Pages create the table with `useTable({ features: dataListFeatures, ... })`:

- `dataListFeatures` = row selection, sorting, column visibility, `columnMeta`.
- `meta.mobile` places each column on the mobile card (`title`, `subtitle`, `meta`, `leading`, `menu`, `hidden`).
- Props: `table`, `rowLabel` (accessible name of the checkbox), `onRowOpen`, `empty`, `isLoading` (skeletons).
- Sorting exposed through `aria-sort`, column visibility menu.

---

## Server Data (React Query)

`QueryClient` (in `main.tsx`): `staleTime` 5 min, `gcTime` 10 min, `retry: 1`, no refetch on window focus.

`hooks/queries.ts` holds the hooks and the key factories:

```typescript
queryKeys.dashboard(accountId)       // ['dashboard', accountId]
queryKeys.rules(accountId)           // ['rules', accountId]
queryKeys.ruleStats(accountId)       // ['rules', accountId, 'stats'] — invalidated with rules
queryKeys.jobs(params)               // ['jobs', params]
```

---

## Real Time (SSE)

| Hook | Endpoint | Usage |
|---|---|---|
| `useJobSSE(jobId)` | `GET /api/jobs/:jobId/events` | One job's progress; closes the stream on `completed`/`failed`/`cancelled`, reconnects with backoff (5 attempts max). Used by `JobProgressInline`. |
| `useLiveCounters()` | `GET /api/events` | `counters` event (`mails` per account, `activeRules`, `activeJobs`); the `EventSource` reconnects on its own. |

Both send the cookie (`withCredentials: true`); no token in the URL.

### Undo Window

Trash and archive (Mails, Cleanup), deleting a sender's mails and manually running a rule are enqueued with a server-side delay (`delayMs`, 10 s by default, see [Jobs](jobs.md#undo-window)). `UndoToast` shows a countdown and cancels the job through `DELETE /api/jobs/:id`. `useMailActions` hides the rows optimistically until the job ends or is undone; the other actions (read/unread, labels) are sent with `delayMs: 0`.

### Keyboard Shortcuts

The **Mails** page uses `useKeyboardShortcuts`: `j`/`k` (navigation), `o` (open), `e` (archive), `#` (trash), `r`/`u` (read/unread), `/` (search), `Escape` (clear selection). They are off inside fields, menus and dialogs, and the user can turn them off (`localStorage` `nid.mailShortcuts`).

---

## HTTP Client (axios)

`src/api/client.ts`:

- `baseURL` from `VITE_API_URL` (empty by default: same origin)
- `withCredentials: true`: the httpOnly `token` cookie is sent with every request
- On 401 (except `/auth/me`), redirect to `/login`; 5xx and network errors are logged

Calls go through this client (via `api/index.ts`), never through `fetch`. Exception: SSE `EventSource`s.

---

## Vite Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `` (empty) | Backend API URL. In dev, the Vite proxy redirects `/api` to `localhost:4000` |

In production (multi-stage Dockerfile), the Vite build is served by Nginx, which proxies `/api` to the backend.

---

## Internationalization (i18n)

French (fallback language) and English, through `react-i18next`.

`src/i18n/index.ts` initializes i18next with `LanguageDetector` (order: `localStorage` then browser, key `i18nextLng`) and `fallbackLng: 'fr'`. Translations live in `src/i18n/locales/fr.json` and `en.json`, with keys nested by domain (`shell.*`, `mails.*`, `rules.*`…).

```tsx
const { t } = useTranslation();
return <h1>{t('mails.title')}</h1>;
```

`main.tsx` keeps `<html lang>` in sync with the active language. The language is changed from the user menu.

---

## Tests

### Unit (Vitest)

- `npm run test` (`vitest run`), `jsdom` environment, `globals: true`
- Tests in `src/__tests__/` (`*.test.ts(x)`), global mocks in `setup.ts` (axios, `localStorage`, `matchMedia`, `ResizeObserver`)
- Testing Library (`@testing-library/react`, `user-event`, `jest-dom`)

### End-to-End (Playwright)

- `npm run e2e` (`playwright test`), specs in `frontend/e2e/`
- API mocked by `e2e/mock-api.ts` + `e2e/fixtures/`: no backend needed; Vite starts on port `PW_PORT` (3100 by default)
- Two projects: `desktop` (1280×800) and `mobile` (iPhone 13), locale `fr-FR`
- `a11y.spec.ts` runs axe-core (`@axe-core/playwright`) on every page. **Ratchet**: with `E2E_A11Y_STRICT=1` (set in CI), a page fails when it has more violations than recorded in `e2e/a11y-baseline.json`. Update the baseline after fixing issues: `E2E_A11Y_UPDATE=1 npx playwright test a11y --workers=1`.

---

## Logs

See [Logging](logging.md#frontend): `utils/logger.ts`, `ErrorBoundary`, axios interceptor, global errors in `main.tsx`.

## PWA (Progressive Web App)

Nid is an installable PWA: the app can be added to the home screen on mobile and desktop, with a service worker that precaches the app shell (no offline features).

### Configuration

- **Manifest + Service Worker**: generated by `vite-plugin-pwa` (configured in `vite.config.ts`) as `manifest.webmanifest` and `sw.js` (Workbox), registered by `registerSW()` in `main.tsx`. `registerType: 'autoUpdate'`: a new deployment activates immediately and reloads open tabs.
- **Icons**: 192×192 and 512×512 standard + maskable in `public/`.
- **Meta tags**: `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon` in `index.html`.

### Service Worker Cache Strategy

| Request Type | Strategy | Details |
|---|---|---|
| API (`/api/*`) | Not intercepted | Excluded from the navigation fallback, no runtime cache |
| App shell (build JS, CSS, HTML) | Precache | Versioned per build, outdated entries cleaned up |
| Navigation (HTML) | Precached `index.html` | SPA fallback, except `/api/*` |

nginx serves `sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache` so updates are picked up.

### Installation from the Browser

On Chrome/Edge (desktop and mobile), an "Install" button appears in the URL bar. On Safari iOS, use "Add to Home Screen" from the share menu.

## Responsive (Mobile)

A single responsive app, breakpoint `768px` (`useIsMobile`, aligned with Tailwind's `md`):

| Screen | Navigation | Lists |
|---|---|---|
| **Desktop** (≥ 768px) | Fixed sidebar | Tables |
| **Mobile** (< 768px) | Bottom bar + "More" page | Cards (`DataList`) |

- **Safe areas**: `env(safe-area-inset-*)` for the header, the bottom bar and toasts (standalone PWA mode).
- **Toasts**: placed above the bottom bar on mobile.
- **Skip link**: `#main-content` (in `index.html`) targets the AppShell `<main>`.
