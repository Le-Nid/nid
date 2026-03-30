# API — Détection de doublons

Identifier et supprimer les mails archivés en double (même sujet + expéditeur + date).

---

## Détecter les doublons

### GET /api/duplicates/:accountId/archived 🔒

Analyse les mails archivés et retourne les groupes de doublons.

Les doublons sont identifiés par la combinaison `subject + sender + date` (tronquée à la minute).

**Réponse 200**
```json
{
  "groups": [
    {
      "subject": "Votre facture mensuelle",
      "sender": "billing@service.com",
      "date": "2025-12-01T10:30:00Z",
      "count": 3,
      "total_size": 45678,
      "ids": ["uuid-1", "uuid-2", "uuid-3"]
    }
  ],
  "totalGroups": 12,
  "totalDuplicates": 38
}
```

---

## Supprimer les doublons

### POST /api/duplicates/:accountId/archived/delete 🔒

Supprime les mails archivés spécifiés (y compris leurs pièces jointes sur disque).

**Body**
```json
{
  "mailIds": ["uuid-2", "uuid-3"]
}
```

**Réponse 200**
```json
{ "deleted": 2 }
```

!!! tip "Conserver le plus récent"
    Le frontend trie les doublons et propose de supprimer tous les exemplaires sauf le plus récent. Les IDs à supprimer sont envoyés explicitement, le backend ne fait aucun choix automatique.
