# Architecture Frontend

## Stack

| Librairie | Rôle |
|---|---|
| `react 19` | UI, Server Components prêts mais non utilisés (SPA classique) |
| `react-router v7` | Routing client-side |
| `antd v6` | Composants UI (Table, Form, Chart, Layout, etc.) |
| `@ant-design/charts` | Graphiques dashboard (basé sur G2) |
| `lucide-react` | Icônes SVG cohérentes (remplace les emojis et icônes Ant Design) |
| `zustand` | State management global (stores légers) |
| `axios` | Client HTTP avec intercepteurs JWT |
| `dayjs` | Manipulation de dates (requis par Ant Design) |
| `react-i18next` | Internationalisation (hooks `useTranslation`) |
| `i18next` | Moteur i18n, détection automatique de la langue |
| `i18next-browser-languagedetector` | Détection de la langue du navigateur |
| `vite` | Bundler, HMR en dev |

---

## Structure des stores Zustand

### `auth.store.ts`

Gère :
- Token JWT (persisté dans `localStorage`)
- Profil utilisateur local (email, rôle, display_name, avatar_url, quotas)
- Liste des comptes Gmail connectés
- Compte Gmail actif (sélecteur sidebar)
- Connexion via Google SSO (`loginWithToken`)

```typescript
const { token, user, gmailAccounts, activeAccountId } = useAuthStore()
// user.role: 'user' | 'admin'
// user.display_name, user.avatar_url: depuis Google SSO
// user.max_gmail_accounts, user.storage_quota_bytes: quotas
```

---

## Routing

```
/login              → LoginPage (non protégée, gère la 2FA TOTP)
/                   → Redirect → /dashboard
/dashboard          → DashboardPage 🔒
/mails              → MailManagerPage 🔒
/archive            → ArchivePage 🔒
/rules              → RulesPage 🔒 (inclut le drawer Templates)
/jobs               → JobsPage 🔒
/settings           → SettingsPage 🔒 (profil, Gmail, 2FA, audit log)
/admin              → AdminPage 🔒🛡️ (admin uniquement)
/unsubscribe        → UnsubscribePage 🔒
/attachments        → AttachmentsPage 🔒
/duplicates         → DuplicatesPage 🔒
/insights           → InsightsPage 🔒
/privacy            → PrivacyPage 🔒 (pixels espions, PII, chiffrement)
```

### Raccourcis clavier

La page **MailManager** intègre le hook `useKeyboardShortcuts` qui capture les touches `j/k` (navigation), `Enter/o` (ouvrir), `e` (archiver), `#` (corbeille), `r/u` (lu/non lu), `/` (recherche), `Escape` (désélectionner). Les raccourcis sont désactivés dans les champs de saisie.

### Actions de masse

La page **MailManager** propose un bouton **« Tout archiver »** qui lance un archivage différentiel de tous les mails correspondant à la requête en cours, sans sélection manuelle. L’opération est asynchrone (job BullMQ) avec suivi SSE.

Le chargement des métadonnées (sujet, expéditeur, taille) utilise le endpoint **batch** (`POST /messages/batch`) pour récupérer jusqu'à 100 messages en un seul appel, évitant les erreurs 429.

Le composant `ProtectedRoute` vérifie la présence du token JWT. Si absent, redirect vers `/login`.

Le composant `AdminRoute` vérifie que `user.role === 'admin'`. Si non-admin, redirect vers `/dashboard`.

---

## Client HTTP (axios)

`src/api/client.ts` configure un client axios avec :

- `baseURL` depuis `VITE_API_URL`
- Injection automatique du JWT en header `Authorization: Bearer`
- Redirect automatique vers `/login` si réponse 401

Toutes les pages font leurs appels via ce client, jamais via `fetch` directement.

---

## Variables d'environnement Vite

| Variable | Défaut | Description |
|---|---|---|
| `VITE_API_URL` | `` (vide) | URL de l'API backend. En dev, le proxy Vite redirige `/api` vers `localhost:4000` |

En production (Dockerfile multi-stage), le build Vite est servi par Nginx qui proxy `/api` vers le backend.

---

## Icônes (Lucide React)

Toutes les icônes de l'application utilisent [Lucide React](https://lucide.dev/), une bibliothèque d'icônes SVG open source. Les emojis et les icônes Ant Design ont été remplacés pour un rendu professionnel uniforme.

### Utilisation

```tsx
import { Mail, Archive, Trash2, Settings } from 'lucide-react'

<Mail size={16} />
<Archive className="icon-muted" />
```

### Conventions

- **Taille** : `16` dans les menus et boutons, `20-24` dans les titres et cartes
- **Dark mode** : les icônes héritent de `currentColor` et s'adaptent automatiquement au thème
- **i18n** : les clés de traduction référencent des icônes Lucide (pas d'emojis) pour un rendu identique sur toutes les plateformes

---

## Internationalisation (i18n)

L'application est entièrement traduite en **français** (langue par défaut) et **anglais**, grâce à `react-i18next`.

### Configuration

Le fichier `src/i18n/index.ts` initialise i18next avec :

- **`LanguageDetector`** — détecte la langue du navigateur au premier chargement
- **`fallbackLng: 'fr'`** — français par défaut si la langue n'est pas supportée
- **Persistance `localStorage`** — clé `i18nextLng`, le choix de l'utilisateur est mémorisé

### Fichiers de traduction

```
src/i18n/
├── index.ts              ← Configuration i18next
└── locales/
    ├── fr.json           ← ~370+ clés, namespace plat
    └── en.json           ← Traductions anglaises (même structure)
```

Les clés sont organisées par domaine fonctionnel dans un namespace plat :

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

### Sélecteur de langue

Un sélecteur `<Select>` est intégré dans la barre de navigation (`AppLayout.tsx`), entre la cloche de notifications et le toggle thème sombre. Il affiche les drapeaux 🇫🇷 / 🇬🇧 et appelle `i18n.changeLanguage()` au changement.

### Intégration Ant Design et dayjs

- **Ant Design** : la locale du `ConfigProvider` est synchronisée dynamiquement (`frFR` / `enUS`) dans `main.tsx` en fonction de la langue active.
- **dayjs** : la locale est changée dynamiquement dans les composants qui affichent des dates relatives (Rules, Jobs, NotificationBell).
- **`<html lang>`** : l'attribut `lang` du document est mis à jour via un `useEffect` dans `main.tsx`.

### Utilisation dans les composants

Toutes les pages et composants utilisent le hook `useTranslation()` :

```tsx
import { useTranslation } from 'react-i18next';

function MaPage() {
  const { t } = useTranslation();
  return <h1>{t('dashboard.title')}</h1>;
}
```

### Pages et composants traduits

Toutes les pages et composants de l'application sont traduits :

- **Pages** : Login, Dashboard, MailManager, Jobs, Archive, Rules, Settings, Admin, Unsubscribe, Attachments, Insights, Duplicates, Privacy
- **Composants** : AppLayout, BulkActionBar, NotificationBell, MailViewer, GmailSearchInput, RuleFormModal, JobProgressModal

## PWA (Progressive Web App)

Nid est une PWA installable : l'application peut être ajoutée à l'écran d'accueil sur mobile et desktop, et fonctionne partiellement hors-ligne grâce au service worker.

### Configuration

- **Manifest** : `public/manifest.json` — définit le nom, les icônes, les couleurs et le mode `standalone`.
- **Service Worker** : `public/sw.js` — enregistré au chargement dans `main.tsx`.
- **Icônes** : 192×192 et 512×512 en standard + maskable dans `public/`.
- **Meta tags** : `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon` dans `index.html`.

### Stratégie de cache du Service Worker

| Type de requête | Stratégie | Détail |
|---|---|---|
| API (`/api/*`) | Network-only | Pas de cache pour les données dynamiques |
| SSE | Ignorée | Les flux temps réel ne sont pas interceptés |
| Assets statiques (JS, CSS, images) | Cache-first | Mise en cache automatique après premier chargement |
| Navigation (HTML) | Network-first | Fallback sur le cache si hors-ligne (app shell) |

### Installation depuis le navigateur

Sur Chrome/Edge (desktop et mobile), un bouton "Installer" apparaît dans la barre d'URL. Sur Safari iOS, utiliser "Ajouter à l'écran d'accueil" depuis le menu de partage.

## Navigation responsive (mobile)

L'application adopte une approche **responsive** (pas d'app native séparée) via le breakpoint system d'Ant Design (`Grid.useBreakpoint`).

### Comportement par taille d'écran

| Écran | Navigation | Contenu |
|---|---|---|
| **Desktop** (≥ 768px) | Sidebar fixe collapsible (220px / 64px) | Padding 24px |
| **Mobile** (< 768px) | Drawer glissant depuis la gauche (280px) | Padding 12px |

### Adaptations mobiles

- **Hamburger menu** : bouton ☰ dans le header pour ouvrir le drawer de navigation.
- **Fermeture auto** : le drawer se ferme après chaque navigation.
- **User menu compact** : nom et badge admin masqués sur mobile, seul l'avatar reste visible.
- **Touch-friendly** : items de menu 44px minimum (accessibilité WCAG 2.5.8).
- **Safe areas** : support des encoches (notch) via `env(safe-area-inset-*)` pour le mode PWA standalone.
- **Tables scrollables** : scroll horizontal natif sur les tableaux Ant Design.
- **Modals plein écran** : les modals occupent quasi-toute la largeur sur mobile.
