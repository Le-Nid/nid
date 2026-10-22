# API — Partage de mails archivés

Liens publics temporaires vers un mail archivé (lecture seule). Les mails chiffrés ne peuvent pas être consultés par lien.

---

## Créer un lien

### POST /api/shares 🔒

**Body**
```json
{ "archivedMailId": "uuid", "expiresInHours": 24, "maxAccess": 10 }
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `archivedMailId` | uuid | Oui | Mail archivé appartenant à l'un des comptes de l'utilisateur |
| `expiresInHours` | number | Non | 1 à 720 (30 jours), défaut 24 |
| `maxAccess` | number | Non | Nombre maximal de consultations (1 à 1000), illimité si omis |

**Réponse 201**
```json
{
  "id": "uuid",
  "archived_mail_id": "uuid",
  "user_id": "uuid",
  "token": "<64 caractères hexadécimaux>",
  "expires_at": "2026-03-21T10:00:00Z",
  "access_count": 0,
  "max_access": 10,
  "created_at": "2026-03-20T10:00:00Z",
  "subject": "Facture mars",
  "sender": "factures@exemple.com",
  "date": "2026-03-01T10:00:00Z"
}
```

::: warning
Un `archivedMailId` inconnu ou appartenant à un autre utilisateur fait actuellement échouer la requête en `500`.
:::

---

## Lister mes liens

### GET /api/shares 🔒

**Réponse 200** — liens de l'utilisateur, du plus récent au plus ancien (expirés compris) :
```json
[
  {
    "id": "uuid", "archived_mail_id": "uuid", "token": "...", "expires_at": "...",
    "access_count": 3, "max_access": 10, "created_at": "...",
    "subject": "Facture mars", "sender": "factures@exemple.com", "date": "..."
  }
]
```

---

## Révoquer un lien

### DELETE /api/shares/:shareId 🔒

**Réponse 204** — No content. **Réponse 404** : lien introuvable.

---

## Consulter un mail partagé (public)

### GET /api/shares/public/:token

Sans authentification. Chaque consultation réussie incrémente `access_count`.

**Réponse 200**
```json
{
  "subject": "Facture mars",
  "sender": "factures@exemple.com",
  "recipient": "vous@gmail.com",
  "date": "2026-03-01T10:00:00Z",
  "snippet": "Retrouvez ci-joint...",
  "htmlBody": "<p>...</p>",
  "textBody": "..."
}
```

**Erreurs**

| Code | Description |
|---|---|
| 400 | Token mal formé (64 caractères hexadécimaux attendus) |
| 404 | Lien inconnu, expiré, limite de consultations atteinte, ou mail chiffré |
