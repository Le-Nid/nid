# API — Authentification

Toutes les routes protégées nécessitent un header `Authorization: Bearer <token>`.

---

## Auth locale (JWT)

### POST /api/auth/register

Créer un compte local.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

**Réponse 201**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

**Erreurs**

| Code | Description |
|---|---|
| 409 | Email déjà enregistré |
| 400 | Validation échouée (email invalide, password < 8 chars) |

---

### POST /api/auth/login

Se connecter.

**Body**
```json
{ "email": "user@example.com", "password": "motdepasse123" }
```

**Réponse 200**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

**Erreurs**

| Code | Description |
|---|---|
| 401 | Credentials invalides |

---

### GET /api/auth/me 🔒

Récupérer le profil utilisateur et les comptes Gmail associés.

**Réponse 200**
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "created_at": "..." },
  "gmailAccounts": [
    { "id": "uuid", "email": "compte@gmail.com", "is_active": true, "created_at": "..." }
  ]
}
```

---

## OAuth2 Gmail

### GET /api/auth/gmail/connect 🔒

Générer l'URL d'autorisation Google.

**Réponse 200**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

Le frontend redirige l'utilisateur vers cette URL. Google redirige ensuite vers `/api/auth/gmail/callback`.

---

### GET /api/auth/gmail/callback

Callback OAuth2 Google (ne pas appeler directement).

Google redirige vers ce endpoint après autorisation. Il :
1. Échange le code contre des tokens
2. Récupère l'email du compte Google
3. Stocke les tokens en base
4. Redirige vers le frontend : `{FRONTEND_URL}/settings?gmail=connected&account=...`

---

### DELETE /api/auth/gmail/:accountId 🔒

Déconnecter un compte Gmail.

**Réponse 204** — No content

!!! note
    Les archives existantes de ce compte **ne sont pas supprimées** lors de la déconnexion.
