# API Admin

Routes réservées aux utilisateurs avec le rôle `admin`.  
Toutes les routes sont préfixées par `/api/admin`.

---

## Statistiques globales

```http
GET /api/admin/stats
Authorization: Bearer <token_admin>
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
Authorization: Bearer <token_admin>
```

| Paramètre | Type | Description |
|---|---|---|
| `page` | number | Page (défaut : 1) |
| `limit` | number | Résultats par page (défaut : 50, max : 100) |
| `search` | string | Recherche par email ou nom |

**Réponse :** liste paginée avec `gmail_accounts_count` et `storage_used_bytes` par user.

### Détail d'un utilisateur

```http
GET /api/admin/users/:userId
Authorization: Bearer <token_admin>
```

**Réponse :** détails du user + liste de ses comptes Gmail + 20 derniers jobs.

### Modifier un utilisateur

```http
PATCH /api/admin/users/:userId
Authorization: Bearer <token_admin>
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

---

## Jobs (vue globale)

```http
GET /api/admin/jobs?page=1&limit=50&status=failed
Authorization: Bearer <token_admin>
```

Retourne les jobs de **tous les utilisateurs** avec l'email de l'utilisateur associé.

---

## Codes d'erreur

| Code | Description |
|---|---|
| 401 | Token JWT manquant ou invalide |
| 403 | L'utilisateur n'est pas admin |
| 404 | Ressource non trouvée |
