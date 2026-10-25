# API Admin

Routes réservées aux utilisateurs avec le rôle `admin` (JWT en cookie ou header `Authorization: Bearer`).  
Toutes les routes sont préfixées par `/api/admin`.

---

## Statistiques globales

```http
GET /api/admin/stats
```

**Réponse :**
```json
{
  "users": 12,
  "gmailAccounts": 28,
  "jobs": { "total": 150, "completed": 140, "failed": 5, "active": 2 },
  "archives": { "totalMails": 5230, "totalSizeBytes": 2147483648 }
}
```

---

## Utilisateurs

### Lister les utilisateurs

```http
GET /api/admin/users?page=1&limit=50&search=john
```

| Paramètre | Type | Description |
|---|---|---|
| `page` | number | Page (défaut : 1) |
| `limit` | number | Résultats par page (défaut : 50, max : 100) |
| `search` | string | Recherche par email ou nom |

**Réponse :**
```json
{
  "users": [
    {
      "id": "uuid", "email": "john@example.com", "role": "user", "display_name": "John",
      "avatar_url": null, "is_active": true, "max_gmail_accounts": 3,
      "storage_quota_bytes": 5368709120, "last_login_at": "...", "created_at": "...",
      "gmail_accounts_count": 2, "storage_used_bytes": 1073741824
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

`total` tient compte de `search`.

### Détail d'un utilisateur

```http
GET /api/admin/users/:userId
```

**Réponse :** `{ "user": {...}, "gmailAccounts": [{ "id", "email", "is_active", "created_at" }], "recentJobs": [...] }` (20 derniers jobs). `404` si l'utilisateur n'existe pas.

### Modifier un utilisateur

```http
PATCH /api/admin/users/:userId
Content-Type: application/json
```

```json
{
  "role": "admin",
  "is_active": true,
  "max_gmail_accounts": 5,
  "storage_quota_bytes": 10737418240
}
```

| Champ | Type | Description |
|---|---|---|
| `role` | `"admin"` \| `"user"` | Rôle de l'utilisateur |
| `is_active` | boolean | Activer/désactiver le compte |
| `max_gmail_accounts` | number | Nombre max de comptes Gmail (1-50) |
| `storage_quota_bytes` | number | Quota de stockage archives (en octets) |

**Réponse :** `{ "id", "email", "role", "is_active", "max_gmail_accounts", "storage_quota_bytes" }`. `400` si aucun champ, `404` si l'utilisateur n'existe pas.

### Réinitialiser le mot de passe

```http
POST /api/admin/users/:userId/password
Content-Type: application/json
```

```json
{ "password": "provisoire-8-caracteres-min" }
```

Remplace le mot de passe, révoque toutes les sessions de l'utilisateur et supprime ses passkeys (une passkey ajoutée depuis une session volée ne survit pas à la récupération du compte). Tracé `admin.reset_password`. **Réponse 204**, `404` si l'utilisateur n'existe pas.

### Supprimer un utilisateur

```http
DELETE /api/admin/users/:userId
```

Suppression définitive (comptes Gmail, archives en base et sur disque, règles…). Tracé `admin.delete_user` (email dans `details`). **Réponse 204**. `400` sur son propre compte (passer par `DELETE /api/auth/me`), `404` si inconnu, `409` pour le dernier admin actif.

---

## Jobs (vue globale)

```http
GET /api/admin/jobs?page=1&limit=50&status=failed
```

Retourne les jobs de **tous les utilisateurs** avec l'email de l'utilisateur associé (`user_email`).

**Réponse :** `{ "jobs": [...], "total": 150, "page": 1, "limit": 50 }` (`total` = nombre total de jobs, sans filtre).

---

## Quota Gmail API de l'instance

```http
GET /api/admin/quota
```

**Réponse :**
```json
{
  "day": { "units": 125000, "calls": 25000, "limit": 1000000000 },
  "peakPerSecond": { "units": 120, "account": "compte@gmail.com", "limit": 250 },
  "rateLimited24h": 3
}
```

- `day` : unités consommées depuis minuit UTC.
- `peakPerSecond` : seconde la plus chargée du jour pour une boîte (limite Gmail 250 unités / utilisateur / seconde).
- `rateLimited24h` : réponses Gmail limitées (429 / rateLimitExceeded) réessayées sur 24 h.

---

## Journal d'audit de l'instance

```http
GET /api/admin/audit?user=john&action=user.login&page=1&limit=50
```

| Paramètre | Description |
|---|---|
| `user` | Filtre sur l'email de l'utilisateur (ILIKE) |
| `action` | Action exacte (ex. `user.login`) |
| `page` / `limit` | Pagination (défaut 50, max 100) |

**Réponse :**
```json
{
  "logs": [
    {
      "id": "uuid", "user_id": "uuid", "user_email": "john@example.com", "action": "user.login",
      "target_type": null, "target_id": null, "details": null, "created_at": "..."
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "actions": ["admin.empty_archive_trash", "user.login"]
}
```

`actions` : liste des actions présentes dans le journal (choix du filtre).

---

## Système

```http
GET /api/admin/system
```

État de la corbeille des archives de l'instance et dernière vérification d'intégrité.

**Réponse :**
```json
{
  "trash": { "count": 42, "sizeBytes": 1234567, "retentionDays": 30, "purgeEnabled": true, "nextPurgeAt": "..." },
  "integrity": {
    "checkedAt": "...", "checkedFiles": 5230, "missing": 0, "corrupted": 0, "orphaned": 0, "healthy": true
  }
}
```

`integrity` vaut `null` si aucune vérification n'a encore eu lieu ; `nextPurgeAt` vaut `null` si la purge est désactivée ou la corbeille vide.

---

## Vider la corbeille des archives

```http
DELETE /api/admin/archive-trash
```

Supprime définitivement les mails à la corbeille des archives de **tous les comptes**. Action tracée dans l'audit (`admin.empty_archive_trash`).

**Réponse :**
```json
{ "deleted": 42, "sizeBytes": 1234567 }
```

---

## Codes d'erreur

| Code | Description |
|---|---|
| 401 | Token JWT manquant ou invalide |
| 403 | L'utilisateur n'est pas admin |
| 404 | Ressource non trouvée |
