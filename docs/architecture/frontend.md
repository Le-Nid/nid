# Architecture Frontend

## Stack

| Librairie | Rôle |
|---|---|
| `react 19` | UI, Server Components prêts mais non utilisés (SPA classique) |
| `react-router-dom v6` | Routing client-side |
| `antd v5` | Composants UI (Table, Form, Chart, Layout, etc.) |
| `@ant-design/charts` | Graphiques dashboard (basé sur G2) |
| `zustand` | State management global (stores légers) |
| `axios` | Client HTTP avec intercepteurs JWT |
| `dayjs` | Manipulation de dates (requis par Ant Design) |
| `vite` | Bundler, HMR en dev |

---

## Structure des stores Zustand

### `auth.store.ts`

Gère :
- Token JWT (persisté dans `localStorage`)
- Profil utilisateur local
- Liste des comptes Gmail connectés
- Compte Gmail actif (sélecteur sidebar)

```typescript
const { token, user, gmailAccounts, activeAccountId } = useAuthStore()
```

---

## Routing

```
/login              → LoginPage (non protégée)
/                   → Redirect → /dashboard
/dashboard          → DashboardPage 🔒
/mails              → MailManagerPage 🔒
/archive            → ArchivePage 🔒
/jobs               → JobsPage 🔒
/settings           → SettingsPage 🔒
```

Le composant `ProtectedRoute` vérifie la présence du token JWT. Si absent, redirect vers `/login`.

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
