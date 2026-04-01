# API — Gmail

Toutes les routes nécessitent `Authorization: Bearer <token>`.

`:accountId` = UUID du compte Gmail (récupéré via `GET /api/auth/me`).

---

## Profil

### GET /api/gmail/:accountId/profile

Retourne le profil Gmail (email, nombre de messages, threads).

```json
{
  "emailAddress": "compte@gmail.com",
  "messagesTotal": 5234,
  "threadsTotal": 3102,
  "historyId": "123456"
}
```

---

## Messages

### GET /api/gmail/:accountId/messages

Liste paginée des messages.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Requête Gmail native (`from:`, `has:attachment`, `larger:1mb`, etc.) |
| `pageToken` | string | Token de pagination (retourné par la réponse précédente) |
| `maxResults` | number | Nombre de résultats (défaut : 50, max : 500) |

**Réponse**
```json
{
  "messages": [{ "id": "abc123", "threadId": "def456" }],
  "nextPageToken": "token_page_suivante",
  "resultSizeEstimate": 5234
}
```

!!! info "Deux niveaux de requêtes"
    `messages.list` retourne uniquement des IDs. Pour les métadonnées complètes (sujet, expéditeur, taille), utilisez `GET /messages/:id` ou les stats du dashboard qui font le batchGet.

---

### GET /api/gmail/:accountId/messages/:messageId

Métadonnées d'un message (headers uniquement, léger).

```json
{
  "id": "abc123",
  "threadId": "def456",
  "subject": "Votre facture de mars",
  "from": "factures@exemple.com",
  "to": "vous@gmail.com",
  "date": "Mon, 01 Mar 2024 10:00:00 +0000",
  "sizeEstimate": 45678,
  "snippet": "Retrouvez ci-joint votre facture...",
  "labelIds": ["INBOX", "Label_123"],
  "hasAttachments": true
}
```

---

### GET /api/gmail/:accountId/messages/:messageId/full

Message complet (format Gmail API `full` — payload, parts, attachments). Utilisé pour la lecture et l'archivage.

---

### POST /api/gmail/:accountId/messages/batch

Récupère les métadonnées de plusieurs messages en un seul appel. Évite les appels individuels multiples et les erreurs 429.

**Body**
```json
{
  "ids": ["id1", "id2", "id3"]
}
```

| Champ | Type | Description |
|---|---|---|
| `ids` | string[] | Liste d'IDs Gmail (max : 100) |

**Réponse 200**
```json
[
  {
    "id": "id1",
    "subject": "Facture mars",
    "from": "factures@exemple.com",
    "date": "Mon, 01 Mar 2024 10:00:00 +0000",
    "sizeEstimate": 45678,
    "snippet": "Retrouvez ci-joint...",
    "labelIds": ["INBOX"],
    "hasAttachments": true
  }
]
```

---

### POST /api/gmail/:accountId/messages/bulk

Déclenche une opération bulk asynchrone. Retourne immédiatement un `jobId`.

**Body**
```json
{
  "action": "trash",
  "messageIds": ["id1", "id2", "id3"],
  "labelId": "Label_123"
}
```

**Actions disponibles**

| Action | Description |
|---|---|
| `trash` | Envoyer à la corbeille Gmail (récupérable 30 jours) |
| `delete` | Supprimer définitivement ⚠️ irréversible |
| `archive` | Retirer de INBOX (équivalent bouton Archive Gmail) |
| `label` | Ajouter `labelId` aux messages |
| `unlabel` | Retirer `labelId` des messages |
| `mark_read` | Marquer comme lu |
| `mark_unread` | Marquer comme non lu |

**Réponse 202**
```json
{ "jobId": "bulk_operation-1234567890", "message": "Job enqueued" }
```

---

## Labels

### GET /api/gmail/:accountId/labels

Liste tous les labels du compte Gmail.

### POST /api/gmail/:accountId/labels

Créer un label.

```json
{ "name": "Mon Label" }
```

### DELETE /api/gmail/:accountId/labels/:labelId

Supprimer un label.
