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
| `has_attachments` | Filtrer par présence de pièces jointes (`true` / `false`) |
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

---

## Export ZIP

### POST /api/archive/:accountId/export-zip

Exporte une sélection de mails archivés en fichier ZIP (streaming chunked).

**Body**
```json
{
  "mailIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Réponse 200** — Fichier ZIP en téléchargement (`Content-Type: application/zip`).

---

## Threads / Conversations

### Lister les conversations archivées

#### GET /api/archive/:accountId/threads

Retourne les mails archivés groupés par `thread_id` (conversation Gmail). Pour chaque thread, le mail le plus récent est retourné avec des métadonnées de résumé.

**Query params**

| Param | Description |
|---|---|
| `q` | Recherche full-text (PostgreSQL tsvector) |
| `sender` | Filtrer par expéditeur (ILIKE) |
| `from_date` | Date de début (ISO 8601) |
| `to_date` | Date de fin (ISO 8601) |
| `has_attachments` | Filtrer par présence de pièces jointes (`true` / `false`) |
| `page` | Page (défaut : 1) |
| `limit` | Résultats par page (défaut : 50) |

**Réponse 200**
```json
{
  "threads": [
    {
      "thread_id": "gmail-thread-id",
      "message_count": 5,
      "latest_date": "2026-03-20T14:30:00Z",
      "senders": ["alice@example.com", "bob@example.com"],
      "total_size": 234567,
      "has_attachments": true,
      "id": "uuid-latest-mail",
      "subject": "Re: Projet Q1",
      "sender": "alice@example.com",
      "snippet": "OK, on valide le budget...",
      "date": "2026-03-20T14:30:00Z",
      "archived_at": "2026-03-21T08:00:00Z"
    }
  ],
  "total": 342,
  "page": 1,
  "limit": 50
}
```

::: tip Champs de résumé par thread
- `message_count` — Nombre de mails dans la conversation
- `senders` — Liste des expéditeurs uniques
- `total_size` — Taille cumulée de tous les mails du thread
- `latest_date` — Date du mail le plus récent
:::

---

### Lire une conversation complète

#### GET /api/archive/:accountId/threads/:threadId

Retourne tous les mails d'un thread, triés par date croissante (ordre chronologique), avec leurs pièces jointes.

**Réponse 200**
```json
[
  {
    "id": "uuid-mail-1",
    "gmail_message_id": "abc123",
    "thread_id": "gmail-thread-id",
    "subject": "Projet Q1",
    "sender": "bob@example.com",
    "recipient": "alice@example.com",
    "date": "2026-03-15T10:00:00Z",
    "size_bytes": 12345,
    "has_attachments": false,
    "in_reply_to": null,
    "references_header": null,
    "attachments": []
  },
  {
    "id": "uuid-mail-2",
    "gmail_message_id": "def456",
    "thread_id": "gmail-thread-id",
    "subject": "Re: Projet Q1",
    "sender": "alice@example.com",
    "date": "2026-03-20T14:30:00Z",
    "size_bytes": 45678,
    "has_attachments": true,
    "in_reply_to": "<abc123@mail.gmail.com>",
    "references_header": "<abc123@mail.gmail.com>",
    "attachments": [
      {
        "id": "uuid-att-1",
        "filename": "budget.xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size_bytes": 34567
      }
    ]
  }
]
```

---

## Utilisation dans le frontend

### Toggle Liste / Conversations

La page Archives dispose d'un sélecteur `Segmented` permettant de basculer entre :

- **Liste** — Mode par défaut, affichage tabulaire paginé (existant)
- **Conversations** — Groupement par thread Gmail

### Vue Conversations

- Chaque conversation est une carte affichant : badge nombre de messages, sujet, expéditeurs, taille totale, date du dernier message
- **Clic** sur une conversation → expansion inline avec la liste chronologique des mails
- Chaque mail du thread est cliquable pour ouvrir le viewer complet (Drawer avec HTML/EML)
- Indentation visuelle progressive pour refléter la profondeur de la conversation
- Pagination manuelle (précédent / suivant)

### Nouveaux champs archivés

L'archivage extrait désormais deux headers supplémentaires depuis les EML :

- `in_reply_to` — Header `In-Reply-To` (identifie le message parent)
- `references_header` — Header `References` (chaîne complète de la conversation)
