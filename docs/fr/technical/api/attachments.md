# API — Pièces jointes

Gestion centralisée des pièces jointes : archives sur NAS et live Gmail.

---

## Pièces jointes archivées

### GET /api/attachments/:accountId/archived 🔒

Liste les PJ des mails archivés avec pagination, tri et recherche.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `50` | Résultats par page (max 100) |
| `sort` | `size` | Tri : `size` ou `date` |
| `order` | `desc` | Ordre : `asc` ou `desc` |
| `q` | — | Recherche dans filename, subject, sender |

**Réponse 200**
```json
{
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture-mars-2026.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 245000,
      "file_path": "/archives/...",
      "mail_subject": "Votre facture",
      "mail_sender": "billing@service.com",
      "mail_date": "2026-03-01T10:00:00Z",
      "gmail_message_id": "msg-123",
      "archived_mail_id": "uuid"
    }
  ],
  "total": 156,
  "totalSizeBytes": 52428800,
  "page": 1,
  "limit": 50
}
```

---

## Pièces jointes live Gmail

### GET /api/attachments/:accountId/live 🔒

Scanne les mails Gmail avec PJ (> 100 Ko) directement via l'API Gmail.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `maxResults` | `200` | Nombre max de messages à scanner (max 500) |

**Réponse 200**
```json
{
  "attachments": [
    {
      "messageId": "msg-456",
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 1500000,
      "mailSubject": "Vacances",
      "mailSender": "ami@gmail.com",
      "mailDate": "2026-02-15",
      "mailSizeEstimate": 1600000
    }
  ],
  "totalSizeBytes": 45000000
}
```

::: info Throttling Gmail API
Le scan live respecte les quotas Gmail API : métadonnées lues par lots de 25 messages (`GMAIL_BATCH_SIZE`) avec une pause de 1 s (`GMAIL_THROTTLE_MS`) entre chaque lot.
:::

---

## Téléchargement

### GET /api/attachments/:accountId/archived/:attachmentId/download 🔒

Télécharge une pièce jointe archivée. `?inline=1` l'affiche dans le navigateur, uniquement pour PNG, JPEG, GIF, WebP et PDF (les autres types, dont SVG et HTML, sont toujours servis en `attachment`). Réponse avec `X-Content-Type-Options: nosniff` (et une CSP `sandbox` pour les images inline).

**Erreurs** : `404` pièce jointe inconnue pour ce compte ou fichier absent du disque.

### GET /api/attachments/:accountId/live/:messageId/download 🔒

Télécharge une pièce jointe directement depuis Gmail.

| Param | Description |
|---|---|
| `filename` | **Requis** : nom du fichier dans le message |
| `inline` | `1` : affichage inline (mêmes types autorisés que ci-dessus) |

**Erreurs** : `400` `filename` manquant ; `404` pièce jointe introuvable dans le message.

---

## Déduplication

Les pièces jointes archivées sont identifiées par leur empreinte SHA-256 (`content_hash`) ; les fichiers identiques ne sont stockés qu'une fois.

### GET /api/attachments/dedup-stats 🔒

Statistiques de déduplication sur tous les comptes de l'utilisateur. `hashCoverage` : part des pièces jointes déjà hachées (0 à 1).

**Réponse 200**
```json
{
  "totalAttachments": 1200,
  "uniqueFiles": 950,
  "duplicateFiles": 250,
  "totalSizeBytes": 524288000,
  "deduplicatedSizeBytes": 419430400,
  "savedBytes": 104857600,
  "hashCoverage": 1
}
```

### POST /api/attachments/dedup-backfill 🔒

Calcule l'empreinte des pièces jointes archivées qui n'en ont pas encore, puis fusionne les doublons (synchrone).

**Réponse 200**
```json
{ "processed": 120, "failed": 0, "duplicatesRemoved": 15 }
```
