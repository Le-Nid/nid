# API — Intégrité des archives

Vérifie la cohérence entre les fichiers EML sur disque et l'index PostgreSQL. Réservé aux administrateurs.

---

## Lancer une vérification (synchrone)

### GET /api/integrity/check

**Auth** : JWT + rôle `admin`

**Query params**

| Param | Type | Description |
|---|---|---|
| `accountId` | `uuid` (optionnel) | Restreindre la vérification à un compte Gmail |

**Réponse**

```json
{
  "totalRecords": 12345,
  "checkedFiles": 12340,
  "missingFiles": ["account-uuid/2024/03/msg123.eml"],
  "orphanedFiles": ["account-uuid/2024/01/orphan.eml"],
  "corruptedFiles": ["account-uuid/2024/02/empty.eml"],
  "healthy": false
}
```

| Champ | Description |
|---|---|
| `totalRecords` | Nombre d'enregistrements dans la table `archived_mails` |
| `checkedFiles` | Nombre de fichiers EML vérifiés |
| `missingFiles` | Fichiers référencés en BDD mais absents du disque |
| `orphanedFiles` | Fichiers EML sur disque sans enregistrement en BDD |
| `corruptedFiles` | Fichiers existants mais vides (0 octets) |
| `healthy` | `true` si aucun problème détecté |

---

## Lancer une vérification (asynchrone)

### POST /api/integrity/check/async

Enqueue un job BullMQ `integrity_check`. Utile pour les grosses archives (évite un timeout HTTP).

**Auth** : JWT + rôle `admin`

**Réponse** `202 Accepted`

```json
{
  "jobId": "bullmq-job-id",
  "message": "Integrity check enqueued"
}
```

Le résultat est consultable via la page **Jobs**.

---

## Vérification planifiée

Une vérification automatique est exécutée quotidiennement à **3h du matin** via le scheduler BullMQ. Les résultats sont visibles dans les Jobs et déclenchent un événement webhook `integrity.failed` en cas de problème.
