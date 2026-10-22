# Architecture Frontend

La spécification de l'interface (navigation, pages, composants) est `design/ui-redesign.md`.

## Stack

| Librairie | Rôle |
|---|---|
| `react 19` + `react-dom` | UI (SPA, chargement des pages en `lazy()`) |
| `react-router 7` | Routing client-side |
| `vite 8` + `@vitejs/plugin-react` | Bundler, HMR en dev, proxy `/api` → `localhost:4000` |
| `tailwindcss 4` (`@tailwindcss/vite`) | Styles utilitaires, thème clair/sombre par variables CSS |
| `radix-ui` + shadcn/ui | Primitives accessibles ; composants shadcn vendorisés dans `src/components/ui/` |
| `@tanstack/react-table 9` | Tableaux (tri, sélection, colonnes visibles) via `DataList` |
| `@tanstack/react-query 5` | Données serveur (cache, invalidation) |
| `zustand 5` | State client (session, thème) |
| `axios` | Client HTTP (cookie httpOnly, intercepteur 401) |
| `sonner` | Toasts (dont le toast d'annulation) |
| `cmdk` | Palette de commandes ⌘K |
| `lucide-react`, `@icons-pack/react-simple-icons` | Icônes |
| `dayjs` | Dates relatives |
| `i18next`, `react-i18next`, `i18next-browser-languagedetector` | Internationalisation fr/en |
| `vite-plugin-pwa` | Manifest + service worker |
| `@fontsource-variable/geist`, `geist-mono` | Polices |

---

## Structure de `src/`

```
src/
├── App.tsx                ← Routes, ProtectedRoute, AdminRoute, redirections
├── main.tsx               ← QueryClient, BrowserRouter, ErrorBoundary, registerSW
├── api/
│   ├── client.ts          ← Instance axios (withCredentials, intercepteur 401)
│   └── index.ts           ← Endpoints groupés par module (jobsApi, rulesApi…)
├── components/
│   ├── app/               ← Composants applicatifs (AppShell, DataList, MailViewer…)
│   ├── ui/                ← shadcn/ui vendorisé (button, dialog, sheet, sidebar, table…)
│   └── ErrorBoundary.tsx
├── hooks/
│   ├── queries.ts         ← Hooks React Query + query key factories
│   ├── useJobSSE.ts       ← Suivi d'un job (SSE)
│   ├── useLiveCounters.ts ← Compteurs live (SSE)
│   ├── useGlobalJobNotifier.tsx, useMailActions.ts, useKeyboardShortcuts.ts
│   ├── useAccount.ts, use-mobile.ts
├── pages/                 ← Une page par route + sous-dossiers d'onglets
│   ├── admin/ archives/ cleanup/ overview/ rules/ settings/
├── store/                 ← auth.store.ts, theme.store.ts
├── i18n/                  ← index.ts + locales/fr.json, en.json
├── lib/utils.ts           ← cn() (clsx + tailwind-merge)
├── styles/, types/, utils/  ← format, gmail, download, logger…
└── __tests__/             ← Tests Vitest + setup.ts
```

---

## Stores Zustand

Les données serveur passent par React Query ; Zustand ne garde que l'état client.

### `auth.store.ts`

- `user` (email, rôle, display_name, avatar_url, quotas, `totp_enabled`), `isAuthenticated`, `initialLoading`
- `gmailAccounts` (avec `backup_enabled`, `backup_interval`, `needs_reauth`) et `activeAccountId` (persisté dans `localStorage`)
- Actions : `login`, `register`, `loginWithSsoCode`, `logout`, `fetchMe`, `setActiveAccount`

Aucun token n'est stocké côté client : la session est un cookie httpOnly. `App.tsx` appelle `fetchMe()` au montage pour restaurer la session.

### `theme.store.ts`

Mode `light` / `dark` ; préférence `system` (rien en `localStorage`) = suit `prefers-color-scheme`. Importé dans `main.tsx` pour appliquer la classe `.dark` avant le premier rendu.

---

## Routing

```
/login              → Login (non protégée, 2FA TOTP)
/shared/:token      → SharedMail (lien de partage public)
/                   → AppShell 🔒, puis :
  /overview         → Vue d'ensemble          (RequireGmailAccess)
  /mails            → Mails                   (RequireGmailAccess)
  /cleanup          → Nettoyage               (RequireGmailAccess)
  /rules            → Règles                  (RequireGmailAccess)
  /archives         → Archives
  /attachments      → Pièces jointes
  /activity         → Activité (jobs)
  /settings/:section→ Paramètres (account, gmail, security, notifications, data)
  /more             → Plus (menu mobile)
  /admin            → Administration 🛡️ (AdminRoute)
```

- `ProtectedRoute` attend `initialLoading` puis redirige vers `/login` si non authentifié.
- `AdminRoute` redirige vers `/overview` si `user.role !== 'admin'`.
- `RequireGmailAccess` : sur un compte Gmail déconnecté, les pages qui appellent Gmail proposent la reconnexion au lieu d'échouer.

### Redirections des anciennes URL

| Ancienne URL | Cible |
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

Les redirections gardent la query string (ex. `/settings?gmail=connected` au retour OAuth).

---

## AppShell et navigation

`components/app/AppShell.tsx` est le layout de toutes les pages authentifiées :

- **≥ 768 px** : `AppSidebar` (shadcn `Sidebar`, 15rem) avec les entrées de `components/app/nav.ts` et leurs badges live.
- **< 768 px** (`useIsMobile`) : `BottomNav` (Vue d'ensemble, Mails, Nettoyage, Archives, Plus) ; `/more` regroupe le reste.
- En-tête : `NotificationBell` + menu utilisateur (comptes, thème, langue, déconnexion).
- `CommandPalette` (⌘K, `cmdk`), `Toaster` sonner, `useGlobalJobNotifier()` (toast à la fin d'un job, selon les préférences).
- `useLiveCounters()` ouvre **une** connexion SSE par onglet ; les pages lisent les compteurs via `useOutletContext()`.

`nav.ts` définit les entrées (`NAV`), les préfixes qui les allument (anciennes pages incluses), les badges (`navBadge` : total de mails, règles actives, jobs actifs) et `visibleNav(role)` (Administration réservée aux admins).

---

## Listes : `DataList`

`components/app/DataList.tsx` rend une instance TanStack Table en `<table>` (≥ md) ou en cartes (mobile). Les pages créent la table avec `useTable({ features: dataListFeatures, ... })` :

- `dataListFeatures` = sélection de lignes, tri, visibilité des colonnes, `columnMeta`.
- `meta.mobile` place chaque colonne sur la carte mobile (`title`, `subtitle`, `meta`, `leading`, `menu`, `hidden`).
- Props : `table`, `rowLabel` (nom accessible de la case à cocher), `onRowOpen`, `empty`, `isLoading` (squelettes).
- Tri annoncé par `aria-sort`, menu de colonnes visibles.

---

## Données serveur (React Query)

`QueryClient` (dans `main.tsx`) : `staleTime` 5 min, `gcTime` 10 min, `retry: 1`, pas de refetch au focus.

`hooks/queries.ts` regroupe les hooks et les factories de clés :

```typescript
queryKeys.dashboard(accountId)       // ['dashboard', accountId]
queryKeys.rules(accountId)           // ['rules', accountId]
queryKeys.ruleStats(accountId)       // ['rules', accountId, 'stats'] — invalidée avec rules
queryKeys.jobs(params)               // ['jobs', params]
```

---

## Temps réel (SSE)

| Hook | Endpoint | Usage |
|---|---|---|
| `useJobSSE(jobId)` | `GET /api/jobs/:jobId/events` | Progression d'un job ; ferme le flux sur `completed`/`failed`/`cancelled`, reconnexion avec backoff (5 essais max). Utilisé par `JobProgressInline`. |
| `useLiveCounters()` | `GET /api/events` | Événement `counters` (`mails` par compte, `activeRules`, `activeJobs`) ; l'`EventSource` se reconnecte seul. |

Les deux envoient le cookie (`withCredentials: true`) ; aucun token dans l'URL.

### Fenêtre d'annulation

Corbeille et archivage (Mails, Nettoyage), suppression des mails d'un expéditeur et exécution manuelle d'une règle sont enfilés avec un délai serveur (`delayMs`, 10 s par défaut, voir [Jobs](jobs.md#fenetre-d-annulation)). `UndoToast` affiche un compte à rebours et annule le job via `DELETE /api/jobs/:id`. `useMailActions` masque les lignes de façon optimiste jusqu'à la fin du job ou l'annulation ; les autres actions (lu/non lu, libellés) partent avec `delayMs: 0`.

### Raccourcis clavier

La page **Mails** utilise `useKeyboardShortcuts` : `j`/`k` (navigation), `o` (ouvrir), `e` (archiver), `#` (corbeille), `r`/`u` (lu/non lu), `/` (recherche), `Escape` (désélectionner). Désactivés dans les champs, menus et dialogues, et désactivables par l'utilisateur (`localStorage` `nid.mailShortcuts`).

---

## Client HTTP (axios)

`src/api/client.ts` :

- `baseURL` depuis `VITE_API_URL` (vide par défaut : même origine)
- `withCredentials: true` : le cookie httpOnly `token` part avec chaque requête
- Sur 401 (hors `/auth/me`), redirection vers `/login` ; 5xx et erreurs réseau loguées

Les appels passent par ce client (via `api/index.ts`), jamais par `fetch`. Exceptions : les `EventSource` SSE.

---

## Variables d'environnement Vite

| Variable | Défaut | Description |
|---|---|---|
| `VITE_API_URL` | `` (vide) | URL de l'API backend. En dev, le proxy Vite redirige `/api` vers `localhost:4000` |

En production (Dockerfile multi-stage), le build Vite est servi par Nginx qui proxy `/api` vers le backend.

---

## Internationalisation (i18n)

Français (langue de repli) et anglais, via `react-i18next`.

`src/i18n/index.ts` initialise i18next avec `LanguageDetector` (ordre : `localStorage` puis navigateur, clé `i18nextLng`) et `fallbackLng: 'fr'`. Les traductions sont dans `src/i18n/locales/fr.json` et `en.json`, clés imbriquées par domaine (`shell.*`, `mails.*`, `rules.*`…).

```tsx
const { t } = useTranslation();
return <h1>{t('mails.title')}</h1>;
```

`main.tsx` synchronise `<html lang>` avec la langue active. La langue se change depuis le menu utilisateur.

---

## Tests

### Unitaires (Vitest)

- `npm run test` (`vitest run`), environnement `jsdom`, `globals: true`
- Tests dans `src/__tests__/` (`*.test.ts(x)`), mocks globaux dans `setup.ts` (axios, `localStorage`, `matchMedia`, `ResizeObserver`)
- Testing Library (`@testing-library/react`, `user-event`, `jest-dom`)

### End-to-end (Playwright)

- `npm run e2e` (`playwright test`), specs dans `frontend/e2e/`
- API simulée par `e2e/mock-api.ts` + `e2e/fixtures/` : pas de backend requis ; Vite démarré sur le port `PW_PORT` (3100 par défaut)
- Deux projets : `desktop` (1280×800) et `mobile` (iPhone 13), locale `fr-FR`
- `a11y.spec.ts` lance axe-core (`@axe-core/playwright`) sur chaque page. **Ratchet** : avec `E2E_A11Y_STRICT=1` (activé en CI), une page échoue si elle a plus de violations que dans `e2e/a11y-baseline.json`. Mise à jour du baseline après correction : `E2E_A11Y_UPDATE=1 npx playwright test a11y --workers=1`.

---

## Logs

Voir [Logging](logging.md#frontend) : `utils/logger.ts`, `ErrorBoundary`, intercepteur axios, erreurs globales dans `main.tsx`.

## PWA (Progressive Web App)

Nid est une PWA installable : l'application peut être ajoutée à l'écran d'accueil sur mobile et desktop, avec un service worker qui précache l'app shell (pas de fonctionnalités hors-ligne).

### Configuration

- **Manifest + Service Worker** : générés par `vite-plugin-pwa` (config dans `vite.config.ts`) sous `manifest.webmanifest` et `sw.js` (Workbox), enregistrés par `registerSW()` dans `main.tsx`. `registerType: 'autoUpdate'` : un nouveau déploiement s'active immédiatement et recharge les onglets ouverts.
- **Icônes** : 192×192 et 512×512 en standard + maskable dans `public/`.
- **Meta tags** : `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon` dans `index.html`.

### Stratégie de cache du Service Worker

| Type de requête | Stratégie | Détail |
|---|---|---|
| API (`/api/*`) | Non interceptée | Exclue du fallback de navigation, aucun cache runtime |
| App shell (JS, CSS, HTML du build) | Precache | Versionné par build, entrées obsolètes nettoyées |
| Navigation (HTML) | `index.html` précaché | Fallback SPA, sauf `/api/*` |

nginx sert `sw.js` et `manifest.webmanifest` avec `Cache-Control: no-cache` pour que les mises à jour soient prises en compte.

### Installation depuis le navigateur

Sur Chrome/Edge (desktop et mobile), un bouton "Installer" apparaît dans la barre d'URL. Sur Safari iOS, utiliser "Ajouter à l'écran d'accueil" depuis le menu de partage.

## Responsive (mobile)

Une seule app responsive, point de rupture `768px` (`useIsMobile`, aligné sur `md` de Tailwind) :

| Écran | Navigation | Listes |
|---|---|---|
| **Desktop** (≥ 768px) | Sidebar fixe | Tableaux |
| **Mobile** (< 768px) | Barre du bas + page « Plus » | Cartes (`DataList`) |

- **Safe areas** : `env(safe-area-inset-*)` pour l'en-tête, la barre du bas et les toasts (mode PWA standalone).
- **Toasts** : placés au-dessus de la barre du bas sur mobile.
- **Lien d'évitement** : `#main-content` (dans `index.html`) cible le `<main>` de l'AppShell.
