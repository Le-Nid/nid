# API — Unsubscribe (Newsletters)

Gestion des newsletters et listes de diffusion via les headers `List-Unsubscribe`.

---

## Scanner les newsletters

### POST /api/unsubscribe/:accountId/scan 🔒

Lance un scan asynchrone des headers `List-Unsubscribe` des mails du compte.

**Réponse 202**
```json
{ "jobId": "scan_unsubscribe-123", "message": "Scan enqueued" }
```

---

### GET /api/unsubscribe/:accountId/newsletters 🔒

Dernier résultat du scan (`POST …/scan`), lu en cache (table `newsletter_scans`) : aucun appel Gmail. `scannedAt` vaut `null` tant qu'aucun scan n'a abouti. Les expéditeurs de listes sans `List-Unsubscribe` sont inclus avec `unsubscribeUrl` et `unsubscribeMailto` à `null`. Après la suppression des mails d'un expéditeur, il est retiré du cache (pas de nouveau scan).

**Réponse 200**
```json
{
  "scannedAt": "2026-10-20T08:00:00.000Z",
  "senders": [
    {
      "sender": "Newsletter <newsletter@example.com>",
      "email": "newsletter@example.com",
      "count": 42,
      "totalSizeBytes": 1234567,
      "unreadCount": 40,
      "unsubscribeUrl": "https://example.com/unsubscribe",
      "unsubscribeMailto": null,
      "latestDate": "2026-03-15T10:00:00Z",
      "sampleMessageIds": ["msg-1"]
    }
  ]
}
```

---

## Lister les messages d'un expéditeur

### GET /api/unsubscribe/:accountId/newsletters/:senderEmail/messages 🔒

Récupère tous les IDs de messages d'un expéditeur newsletters donné.

**Réponse 200**
```json
{
  "messageIds": ["msg-1", "msg-2", "msg-3"],
  "count": 3
}
```

---

## Supprimer les mails d'une newsletter

### POST /api/unsubscribe/:accountId/newsletters/:senderEmail/delete 🔒

Supprime en masse tous les mails d'un expéditeur newsletters (via job BullMQ).

**Body**
```json
{ "permanent": false, "delayMs": 10000 }
```

| Champ | Défaut | Description |
|---|---|---|
| `delayMs` | `10000` | Délai avant exécution (0–60000 ms, défaut `10000`). Pendant ce délai le job est `scheduled` et peut être annulé avec `DELETE /api/jobs/:jobId` (annuler). Envoyer `0` pour exécuter immédiatement.
| `permanent` | `false` | `false` = corbeille, `true` = suppression définitive |

**Réponse 202**
```json
{ "jobId": "bulk_operation-456", "runAt": "2026-10-20T12:00:10.000Z", "count": 42 }
```
