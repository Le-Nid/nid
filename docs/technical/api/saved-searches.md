# API — Recherches sauvegardées

Permet de sauvegarder des requêtes Gmail complexes comme des « vues » réutilisables.

Toutes les routes nécessitent `Authorization: Bearer <token>`.

---

## Lister les recherches

### GET /api/saved-searches

Retourne toutes les recherches sauvegardées de l'utilisateur connecté, triées par `sort_order`.

**Réponse 200**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Factures récentes",
    "query": "from:factures@example.com has:attachment newer_than:30d",
    "icon": "invoice",
    "color": "#1677ff",
    "sort_order": 0,
    "created_at": "2026-03-15T10:00:00Z",
    "updated_at": "2026-03-15T10:00:00Z"
  }
]
```

---

## Créer une recherche

### POST /api/saved-searches

**Body**
```json
{
  "name": "Factures récentes",
  "query": "from:factures@example.com has:attachment newer_than:30d",
  "icon": "invoice",
  "color": "#1677ff"
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | string | ✅ | Nom affiché (max 255 car.) |
| `query` | string | ✅ | Requête Gmail native (max 2000 car.) |
| `icon` | string | — | Identifiant d'icône (`folder`, `star`, `mail`, `attachment`, `invoice`, `alert`, `archive`, `calendar`, `work`, `shopping`) |
| `color` | string | — | Code couleur hex (ex : `#1677ff`) |

**Réponse 201** — La recherche créée.

---

## Modifier une recherche

### PUT /api/saved-searches/:searchId

**Body** — Tous les champs sont optionnels.

```json
{
  "name": "Factures Q1 2026",
  "query": "from:factures@example.com after:2026/01/01 before:2026/04/01",
  "icon": "calendar",
  "color": "#52c41a",
  "sort_order": 2
}
```

**Réponse 200** — La recherche mise à jour.

!!! warning "Ownership"
    Seul le propriétaire de la recherche peut la modifier. Retourne `404` si l'ID ne correspond pas à l'utilisateur authentifié.

---

## Supprimer une recherche

### DELETE /api/saved-searches/:searchId

**Réponse 200**
```json
{ "ok": true }
```

---

## Réordonner les recherches

### PUT /api/saved-searches/reorder

Réorganise l'ordre d'affichage de toutes les recherches.

**Body**
```json
{
  "ids": ["uuid-3", "uuid-1", "uuid-2"]
}
```

| Champ | Type | Description |
|---|---|---|
| `ids` | string[] | Liste ordonnée des IDs de recherches sauvegardées |

**Réponse 200**
```json
{ "ok": true }
```

---

## Utilisation dans le frontend

### Page Recherches sauvegardées (`/saved-searches`)

- **Liste** des recherches avec nom, requête, icône, couleur et date de création
- **Création / édition** via modal (nom, requête Gmail, icône, couleur)
- **Utiliser** : redirige vers `/mails?q=<query>` pour exécuter la recherche dans MailManager
- **Supprimer** avec confirmation

### Bouton « Sauvegarder cette recherche » dans MailManager

Lorsqu'une recherche ou un filtre rapide est actif, un bouton ⭐ permet de sauvegarder la requête courante en un clic.

### Navigation

Accessible depuis le menu latéral : **Email → Recherches** (`/saved-searches`).

---

## Schéma base de données

```sql
CREATE TABLE saved_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  query       TEXT NOT NULL,
  icon        VARCHAR(64),
  color       VARCHAR(32),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user_id ON saved_searches (user_id);
```
