# API — Archives

---

## Lister les mails archivés

### GET /api/archive/:accountId/mails

**Query params**

| Param | Description |
|---|---|
| `q` | Recherche full-text (PostgreSQL tsvector) |
| `sender` | Filtrer par expéditeur (ILIKE) |
| `from_date` | Date de début (ISO 8601) |
| `to_date` | Date de fin (ISO 8601) |
| `page` | Page (défaut : 1) |
| `limit` | Résultats par page (défaut : 50) |

**Réponse**
```json
{
  "mails": [
    {
      "id": "uuid",
      "gmail_message_id": "abc123",
      "subject": "Facture mars 2024",
      "sender": "factures@exemple.com",
      "date": "2024-03-01T10:00:00Z",
      "size_bytes": 45678,
      "has_attachments": true,
      "label_ids": ["INBOX"],
      "archived_at": "2024-03-15T12:00:00Z"
    }
  ],
  "total": 4823,
  "page": 1,
  "limit": 50
}
```

---

## Lire un mail archivé

### GET /api/archive/:accountId/mails/:mailId

Retourne le mail avec son contenu EML brut et ses pièces jointes.

```json
{
  "id": "uuid",
  "subject": "...",
  "emlContent": "From: ...\nTo: ...\n\nCorps du mail...",
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 123456,
      "file_path": "/archives/..."
    }
  ]
}
```

---

## Télécharger une pièce jointe archivée

### GET /api/archive/:accountId/attachments/:attachmentId/download

Retourne le fichier en téléchargement direct (`Content-Disposition: attachment`).

---

## Déclencher un archivage

### POST /api/archive/:accountId/archive

Lance un job d'archivage asynchrone.

**Body**
```json
{
  "messageIds": ["id1", "id2"],
  "differential": true
}
```

Ou via requête Gmail :

```json
{
  "query": "older_than:1y has:attachment",
  "differential": true
}
```

| Champ | Description |
|---|---|
| `messageIds` | Liste d'IDs Gmail à archiver (optionnel si `query` fourni) |
| `query` | Requête Gmail native — récupère tous les IDs correspondants |
| `differential` | Si `true` (défaut), skip les mails déjà archivés |

**Réponse 202**
```json
{ "jobId": "archive_mails-1234567890" }
```
