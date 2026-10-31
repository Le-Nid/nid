# API — Webhooks

Permet de recevoir des notifications sur des services externes (Discord, Slack, Ntfy, ou endpoint HTTP générique) lorsque des événements surviennent dans Nid.

---

## Événements supportés

| Événement | Déclencheur |
|---|---|
| `job.completed` | Un job termine avec succès |
| `job.failed` | Un job échoue |
| `rule.executed` | Une règle automatique s'exécute |
| `quota.warning` | Alerte de quota (stockage) |
| `integrity.failed` | La vérification d'intégrité détecte un problème |
| `account.reauth_required` | Google a refusé l'accès à un compte Gmail : il faut le reconnecter (envoyé une fois par incident) |

---

## Types de webhook

| Type | Format | Détails |
|---|---|---|
| `generic` | JSON brut | Signature HMAC-SHA256 dans le header `X-Webhook-Signature` |
| `discord` | Embeds Discord | Couleur verte (succès) ou rouge (échec), limité à 2000 caractères |
| `slack` | Text blocks | Format Markdown Slack avec code block |
| `ntfy` | Notification push | Headers `Title`, `Priority`, `Tags` |

---

## Lister les webhooks

### GET /api/webhooks

**Auth** : JWT

**Réponse**

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Notif Discord",
    "url": "https://discord.com/api/webhooks/...",
    "type": "discord",
    "events": ["job.completed", "job.failed"],
    "is_active": true,
    "secret": null,
    "last_triggered_at": "2024-03-15T12:00:00Z",
    "last_status": 200,
    "created_at": "2024-03-01T10:00:00Z"
  }
]
```

---

## Créer un webhook

### POST /api/webhooks

**Auth** : JWT

**Body**

```json
{
  "name": "Notif Discord",
  "url": "https://discord.com/api/webhooks/...",
  "type": "discord",
  "events": ["job.completed", "job.failed"]
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Nom du webhook (1-100 caractères) |
| `url` | `string` | ✅ | URL cible (doit être une URL valide) |
| `type` | `string` | Non | `generic` (défaut), `discord`, `slack`, `ntfy` |
| `events` | `string[]` | ✅ | Au moins un événement parmi la liste ci-dessus |
| `auth_user` / `auth_password` | `string` | Non | Identifiants Basic Auth, conservés uniquement pour le type `ntfy` (255 caractères max) |

**Réponse** `201 Created`

Pour le type `generic`, un `secret` HMAC est généré automatiquement et inclus dans la réponse.

---

## Modifier un webhook

### PUT /api/webhooks/:webhookId

**Auth** : JWT

**Body** : mêmes champs que la création (tous optionnels). Passer à un type autre que `ntfy` efface `auth_user` / `auth_password`.

**Réponse 200** : le webhook mis à jour. `404` s'il n'existe pas.

---

## Activer / désactiver un webhook

### PATCH /api/webhooks/:webhookId/toggle

**Auth** : JWT

Inverse l'état `is_active` du webhook.

**Réponse 200** : le webhook mis à jour. `404` s'il n'existe pas.

---

## Supprimer un webhook

### DELETE /api/webhooks/:webhookId

**Auth** : JWT

**Réponse** `204 No Content`

---

## Tester un webhook

### POST /api/webhooks/:webhookId/test

**Auth** : JWT

Envoie un événement test `job.completed` pour vérifier la connectivité. Attention : l'envoi passe par le dispatcher normal et part vers **tous** les webhooks actifs de l'utilisateur abonnés à `job.completed` (pas seulement celui-ci). `404` si le webhook n'existe pas.

```json
{
  "success": true
}
```

---

## Signature HMAC (type generic)

Pour les webhooks de type `generic`, chaque requête sortante contient un header `X-Webhook-Signature: sha256=<hex>` calculé avec HMAC-SHA256 sur le body JSON, en utilisant le `secret` du webhook.

Vérification côté récepteur (Node.js) :

```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
const isValid = `sha256=${signature}` === req.headers['x-webhook-signature'];
```
