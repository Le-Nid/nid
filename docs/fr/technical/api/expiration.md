# API — Expiration des mails

Programme la mise à la corbeille Gmail d'un mail à une date donnée (codes OTP, suivis de livraison, promotions…). Le planificateur traite les expirations échues toutes les 15 minutes : les mails sont envoyés à la corbeille Gmail (comptes actifs uniquement) et l'expiration est marquée `is_deleted`.

Toutes les routes nécessitent JWT + propriété du compte Gmail `:accountId`.

---

## Lister les expirations

### GET /api/expiration/:accountId

Expirations en attente (non traitées), triées par date d'expiration croissante.

**Réponse 200**
```json
[
  {
    "id": "uuid",
    "account_id": "uuid",
    "gmail_message_id": "18c2f...",
    "subject": "Votre code de vérification",
    "sender": "no-reply@service.com",
    "expires_at": "2026-03-21T10:00:00Z",
    "category": "otp",
    "is_deleted": false,
    "deleted_at": null,
    "created_at": "2026-03-20T10:00:00Z"
  }
]
```

---

## Statistiques

### GET /api/expiration/:accountId/stats

**Réponse 200**
```json
{ "total": 40, "pending": 12, "deleted": 28, "expiringSoon": 3 }
```

`expiringSoon` : expirations en attente qui échoient dans les 24 h.

---

## Créer une expiration

### POST /api/expiration/:accountId

**Body**
```json
{
  "gmailMessageId": "18c2f...",
  "subject": "Votre code de vérification",
  "sender": "no-reply@service.com",
  "expiresInDays": 1,
  "category": "otp"
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `gmailMessageId` | string | Oui | Id du message Gmail |
| `subject` / `sender` | string | Non | Repris pour l'affichage |
| `expiresAt` | string | Non | Date d'expiration ISO ; prioritaire sur `expiresInDays` |
| `expiresInDays` | number | Non | 1 à 365 (défaut : 7 si aucune date n'est fournie) |
| `category` | string | Non | `manual` (défaut), `otp`, `delivery`, `promo` |

**Réponse 201** : l'expiration créée.

### POST /api/expiration/:accountId/batch

Crée plusieurs expirations en une requête.

**Body**
```json
{ "items": [ { "gmailMessageId": "18c2f...", "expiresInDays": 14, "category": "delivery" } ] }
```

`items` : 1 à 100 éléments, mêmes champs que la création unitaire.

**Réponse 201** : la liste des expirations créées (un mail qui a déjà une expiration est ignoré).

---

## Détecter les mails temporaires

### POST /api/expiration/:accountId/detect

Applique des heuristiques (sujet, expéditeur) pour repérer les mails temporaires. Ne crée rien.

**Body**
```json
{
  "messages": [
    { "gmailMessageId": "18c2f...", "subject": "Votre code de vérification", "sender": "no-reply@service.com" }
  ]
}
```

`messages` : 1 à 500 éléments.

**Réponse 200** — uniquement les messages reconnus :
```json
[
  {
    "gmailMessageId": "18c2f...",
    "subject": "Votre code de vérification",
    "sender": "no-reply@service.com",
    "category": "otp",
    "suggestedDays": 1
  }
]
```

| Catégorie | Délai suggéré |
|---|---|
| `otp` | 1 jour |
| `delivery` | 14 jours |
| `promo` | 7 jours |

---

## Modifier la date d'expiration

### PATCH /api/expiration/:accountId/:expirationId

**Body**
```json
{ "expiresAt": "2026-03-25T10:00:00Z" }
```

**Réponse 200** : l'expiration mise à jour.

---

## Supprimer une expiration

### DELETE /api/expiration/:accountId/:expirationId

Annule l'expiration (le mail Gmail n'est pas touché).

**Réponse 204** — No content
